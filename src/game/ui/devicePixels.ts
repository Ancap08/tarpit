import type Phaser from 'phaser';

type CanvasRenderer = Phaser.Renderer.Canvas.CanvasRenderer;
type Camera = Phaser.Cameras.Scene2D.Camera;
type Matrix = Phaser.GameObjects.Components.TransformMatrix;
type Object2D = Phaser.GameObjects.GameObject & {
  alpha: number; x: number; y: number; scaleX: number; scaleY: number; rotation: number;
  frame?: Phaser.Textures.Frame;
  renderCanvas(renderer: CanvasRenderer, source: Object2D, camera: Camera): void;
};

type CanvasFactory = (game: Phaser.Game, canvas: HTMLCanvasElement) => CanvasRenderer;
let createRenderer: CanvasFactory;
export function useUiCanvasRenderer(factory: CanvasFactory): void {
  createRenderer = factory;
}

const active = new WeakMap<Phaser.Scene, DeviceUi>();
const logical = { x: 1, y: 1 };
export function uiDensity(scene: Phaser.Scene) {
  return active.get(scene)?.density ?? logical;
}

export function uiObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
  active.get(object.scene)?.include(object);
  return object;
}

export function invalidateUi(scene: Phaser.Scene): void {
  active.get(scene)?.invalidate();
}

/** Animate the finished print on the compositor. Phaser's hit boxes stay put. */
export function layPaper(scene: Phaser.Scene, offset: number): void {
  active.get(scene)?.layPaper(offset);
}

/**
 * Phaser still owns the display list, input, camera clips and source
 * textures. Send the interface's objects through its Canvas renderer on a
 * native-pixel overlay, and leave the battlefield on the existing renderer.
 * An unchanged overlay stays composited by the browser without a repaint.
 */
class DeviceUi {
  readonly density = { x: 1, y: 1 };
  private readonly objects = new WeakSet<Phaser.GameObjects.GameObject>();
  private readonly labels = new Set<Phaser.GameObjects.Text>();
  private readonly overlay = document.createElement('canvas');
  private readonly painter: CanvasRenderer;
  private readonly world: Phaser.GameObjects.GameObject[] = [];
  private readonly ink: Object2D[] = [];
  private readonly previous: unknown[] = [];
  private dirty = true;
  private wasMultiCamera = false;

  constructor(scene: Phaser.Scene, private readonly paper: boolean) {
    const { game, scale, renderer } = scene;
    this.painter = createRenderer(game, this.overlay);
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.dataset.interfaceInk = '';
    Object.assign(this.overlay.style, { position: 'fixed', pointerEvents: 'none' });
    game.canvas.after(this.overlay);

    const fitWorld = paper ? undefined : fitBattleBuffer(scene);
    const fit = () => {
      const { left, top, width, height } = scale.canvasBounds;
      const unit = window.devicePixelRatio || 1;
      const x = Math.round(left * unit), y = Math.round(top * unit);
      const w = Math.max(1, Math.round((left + width) * unit) - x);
      const h = Math.max(1, Math.round((top + height) * unit) - y);
      Object.assign(this.overlay.style, {
        left: x / unit + 'px', top: y / unit + 'px', width: w / unit + 'px', height: h / unit + 'px',
      });
      if (this.overlay.width !== w) this.overlay.width = w;
      if (this.overlay.height !== h) this.overlay.height = h;
      fitWorld?.fit();
      this.density.x = w / scale.width;
      this.density.y = h / scale.height;
      for (const label of this.labels) {
        if (label.style.resolution !== this.density.x) {
          label.frame.source.resolution = this.density.x;
          label.setResolution(this.density.x);
        }
      }
      this.dirty = true;
    };
    fit();
    scale.on('resize', fit);

    const factory = scene.add.text;
    scene.add.text = (x, y, value, style) => {
      const label = factory.call(scene.add, x, y, value, { ...style, resolution: this.density.x });
      this.labels.add(label);
      label.once('destroy', () => this.labels.delete(label));
      const update = label.updateText;
      label.updateText = () => {
        this.dirty = true;
        return update.call(label);
      };
      return uiObject(label);
    };

    const render = renderer.render;
    const begin = () => {
      const multi = scene.cameras.cameras.length > 1;
      if (multi || this.wasMultiCamera) this.clear();
      if (multi || this.wasMultiCamera) this.dirty = true;
      this.wasMultiCamera = multi;
    };
    renderer.on('prerender', begin);
    renderer.render = (owner, children, camera) => {
      if (owner !== scene) {
        render.call(renderer, owner, children, camera);
        return;
      }
      this.world.length = this.ink.length = 0;
      for (const child of children) {
        if (paper || this.objects.has(child)) this.ink.push(child as Object2D);
        else this.world.push(child);
      }
      if (fitWorld) fitWorld.draw(camera, () => render.call(renderer, owner, this.world, camera));
      else render.call(renderer, owner, this.world, camera);
      if (camera.name !== 'magnifier') this.paint(camera);
    };

    scene.events.once('shutdown', () => {
      scale.off('resize', fit);
      renderer.off('prerender', begin);
      renderer.render = render;
      fitWorld?.dispose();
      scene.add.text = factory;
      this.overlay.remove();
      active.delete(scene);
    });
  }

  layPaper(offset: number): void {
    const cssOffset = offset * this.density.y / (window.devicePixelRatio || 1);
    this.overlay.animate([{ transform: `translateY(${cssOffset}px)` }, { transform: 'translateY(0)' }], {
      duration: 220, easing: 'cubic-bezier(.2,.65,.3,1)',
    });
  }

  include(object: Phaser.GameObjects.GameObject): void {
    if (this.objects.has(object)) return;
    this.objects.add(object);
    this.dirty = true;
    if (object.type === 'Graphics') {
      const graphics = object as Phaser.GameObjects.Graphics;
      const clear = graphics.clear;
      graphics.clear = () => {
        this.dirty = true;
        return clear.call(graphics);
      };
    }
  }

  invalidate(): void {
    this.dirty = true;
  }

  private clear(): void {
    this.painter.gameContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  private paint(camera: Camera): void {
    const stack = this.previous;
    let index = 0, redraw = this.dirty;
    const track = (value: unknown) => {
      if (stack[index] !== value) redraw = true;
      stack[index++] = value;
    };
    if (!this.wasMultiCamera) {
      for (const object of this.ink) {
        track(object); track(object.x); track(object.y); track(object.alpha);
        track(object.rotation); track(object.scaleX); track(object.scaleY); track(object.frame);
      }
      redraw ||= stack.length !== index;
      stack.length = index;
    }
    if (!redraw) {
      // Keep the ordering for hit testing when the retained image is reused.
      for (const object of this.ink) camera.addToRenderList(object);
      return;
    }
    if (!this.wasMultiCamera) this.clear();
    const ctx = this.painter.gameContext;
    const { x: sx, y: sy } = this.density;
    const { matrix } = camera as Camera & { matrix: Matrix };
    const { a, b, c, d, e, f } = matrix;
    ctx.save();
    if (this.wasMultiCamera) {
      ctx.beginPath();
      ctx.rect(Math.round(camera.x * sx), Math.round(camera.y * sy),
        Math.round(camera.width * sx), Math.round(camera.height * sy));
      ctx.clip();
    }
    if (this.paper) {
      ctx.fillStyle = camera.backgroundColor.rgba;
      ctx.fillRect(0, 0, this.overlay.width, this.overlay.height);
    }
    matrix.setTransform(a * sx, b * sy, c * sx, d * sy, e * sx, f * sy);
    const rounding = camera as { renderRoundPixels: boolean };
    const round = camera.roundPixels, roundPosition = rounding.renderRoundPixels;
    camera.roundPixels = rounding.renderRoundPixels = false;
    for (const object of this.ink) {
      if (object.type !== 'Text' || camera.zoom !== 1) object.renderCanvas(this.painter, object, camera);
      else {
        const label = object as unknown as Phaser.GameObjects.Text;
        const { x, y } = object;
        const left = x - label.displayOriginX - camera.scrollX + camera.x;
        const top = y - label.displayOriginY - camera.scrollY + camera.y;
        object.x += Math.round(left * sx) / sx - left;
        object.y += Math.round(top * sy) / sy - top;
        object.renderCanvas(this.painter, object, camera);
        object.x = x;
        object.y = y;
      }
    }
    camera.roundPixels = round;
    rounding.renderRoundPixels = roundPosition;
    matrix.setTransform(a, b, c, d, e, f);
    ctx.restore();
    this.dirty = false;
  }
}

/**
 * The portrait frame has more space for the controls than the legacy game.
 * Keep the map buffer within a fixed pixel budget. Phaser cameras, the input
 * transform and the high-density interface all retain the logical layout.
 */
function fitBattleBuffer(scene: Phaser.Scene) {
  const { renderer, game, scale } = scene;
  const { canvas } = game;
  const grid = { x: 1, y: 1 };
  const webgl = 'gl' in renderer ? renderer : undefined;
  const painter = 'gameContext' in renderer ? renderer : undefined;
  const push = webgl?.pushScissor;
  const viewport = () => {
    if (!webgl || grid.x === 1 && grid.y === 1) return;
    const { gl } = webgl;
    (webgl as { drawingBufferHeight: number }).drawingBufferHeight = gl.drawingBufferHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.scissor(0, 0, canvas.width, canvas.height);
  };
  if (webgl && push) {
    webgl.on('prerenderclear', viewport);
    webgl.on('prerender', viewport);
    webgl.pushScissor = function (x, y, width, height, buffer) {
      if (!this.currentFramebuffer && (grid.x !== 1 || grid.y !== 1)) {
        const left = Math.round(x * grid.x), top = Math.round(y * grid.y);
        return push.call(this, left, top, Math.round((x + width) * grid.x) - left,
          Math.round((y + height) * grid.y) - top, this.drawingBufferHeight);
      }
      return push.call(this, x, y, width, height, buffer);
    };
  }
  return {
    fit() {
      // Keep at least one world sample per fitted CSS pixel on supported
      // phones. Leave the wider landscape maps at their native size.
      const factor = scale.height > scale.width
        ? Math.min(1, Math.sqrt((480 * 1032) / (scale.width * scale.height))) : 1;
      const width = Math.round(scale.width * factor), height = Math.round(scale.height * factor);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      grid.x = width / scale.width;
      grid.y = height / scale.height;
    },
    draw(camera: Camera, draw: () => void) {
      if (webgl || !painter || grid.x === 1 && grid.y === 1) {
        draw();
        return;
      }
      const ctx = painter.gameContext;
      const { matrix } = camera as Camera & { matrix: Matrix };
      const { a, b, c, d, e, f } = matrix;
      ctx.save();
      ctx.scale(grid.x, grid.y);
      matrix.setTransform(a * grid.x, b * grid.y, c * grid.x, d * grid.y, e * grid.x, f * grid.y);
      draw();
      matrix.setTransform(a, b, c, d, e, f);
      ctx.restore();
    },
    dispose() {
      if (webgl && push) {
        webgl.off('prerenderclear', viewport);
        webgl.off('prerender', viewport);
        webgl.pushScissor = push;
      }
      if (canvas.width === scale.baseSize.width && canvas.height === scale.baseSize.height) return;
      canvas.width = scale.baseSize.width;
      canvas.height = scale.baseSize.height;
      renderer.resize(scale.baseSize.width, scale.baseSize.height);
    },
  };
}

export function useDevicePixels(scene: Phaser.Scene, paper: boolean): void {
  active.set(scene, new DeviceUi(scene, paper));
}
