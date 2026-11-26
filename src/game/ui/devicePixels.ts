import type Phaser from 'phaser';
import type { Rect } from '../input';
import { fitBattleBuffer } from '../skin/fieldBuffer';

type CanvasRenderer = Phaser.Renderer.Canvas.CanvasRenderer;
type Camera = Phaser.Cameras.Scene2D.Camera;
type Matrix = Phaser.GameObjects.Components.TransformMatrix;
type Object2D = Phaser.GameObjects.GameObject & {
  alpha: number; x: number; y: number; scaleX: number; scaleY: number; rotation: number;
  depth: number; width?: number; height?: number; displayOriginX?: number; displayOriginY?: number;
  mask?: Phaser.Display.Masks.BitmapMask | Phaser.Display.Masks.GeometryMask;
  frame?: Phaser.Textures.Frame;
  getBounds?(): Rect;
  renderCanvas(renderer: CanvasRenderer, source: Object2D, camera: Camera): void;
};
type InkState = {
  x: number; y: number; scaleX: number; scaleY: number; rotation: number; alpha: number; depth: number;
  width?: number; height?: number; originX?: number; originY?: number; frame?: Phaser.Textures.Frame;
  bounds?: Rect | null; index: number; pass: number;
};

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function join(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y };
}

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

export function hasFixedUiCamera(scene: Phaser.Scene): boolean {
  return !!active.get(scene)?.inkCamera;
}

export function uiObject<T extends Phaser.GameObjects.GameObject>(object: T): T {
  active.get(object.scene)?.include(object);
  return object;
}

export function invalidateUi(object: Phaser.GameObjects.GameObject): void {
  active.get(object.scene)?.invalidate(object);
}

/** Scene coordinates for Graphics, which do not expose Phaser's getBounds. */
export function uiBounds(object: Phaser.GameObjects.Graphics, bounds: Rect): void {
  active.get(object.scene)?.setBounds(object, bounds);
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
  private readonly previous = new Map<Object2D, InkState>();
  private readonly edits = new Set<Phaser.GameObjects.GameObject>();
  private readonly graphicBounds = new WeakMap<Phaser.GameObjects.Graphics, Rect>();
  private pass = 0;
  private cameraState: number[] = [];
  private dirty = true;
  private wasMultiCamera = false;

  constructor(scene: Phaser.Scene, private readonly paper: boolean, readonly inkCamera?: string) {
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
      const update = label.updateText;
      label.once('destroy', () => {
        label.updateText = update;
        this.labels.delete(label);
      });
      label.updateText = () => {
        this.invalidate(label);
        return update.call(label);
      };
      return uiObject(label);
    };

    const render = renderer.render;
    const begin = () => {
      const multi = !inkCamera && scene.cameras.cameras.some(camera => camera !== scene.cameras.main && camera.name !== 'magnifier');
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
      const drawInk = inkCamera ? camera.name === inkCamera : camera.name !== 'magnifier';
      for (const child of children) {
        if (drawInk && (paper || this.objects.has(child))) this.ink.push(child as Object2D);
        else if (camera.name === 'magnifier' && this.objects.has(child)) continue;
        else this.world.push(child);
      }
      if (fitWorld) fitWorld.draw(camera, () => render.call(renderer, owner, this.world, camera));
      else render.call(renderer, owner, this.world, camera);
      if (drawInk) this.paint(camera);
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
    if (this.paper) this.dirty = true;
    if (object.type === 'Graphics') {
      const graphics = object as Phaser.GameObjects.Graphics;
      const clear = graphics.clear;
      // Phaser's texture-baking camera can keep destroyed Graphics in its
      // render list. Restore the method so those objects cannot retain ink.
      graphics.once('destroy', () => { graphics.clear = clear; });
      graphics.clear = () => {
        this.invalidate(graphics);
        return clear.call(graphics);
      };
    }
  }

  invalidate(object: Phaser.GameObjects.GameObject): void {
    while (object.parentContainer) object = object.parentContainer;
    this.edits.add(object);
  }

  setBounds(object: Phaser.GameObjects.Graphics, bounds: Rect): void {
    this.graphicBounds.set(object, bounds);
    this.invalidate(object);
  }

  private boundsOf(object: Object2D, offsetX: number, offsetY: number): Rect | null | undefined {
    let bounds: Rect | undefined;
    if (object.type === 'Graphics') {
      const graphic = object as unknown as Phaser.GameObjects.Graphics;
      if (graphic.commandBuffer.length === 0) return null;
      bounds = this.graphicBounds.get(graphic);
    } else if (object.type !== 'Container' && object.type !== 'Layer' && !object.mask) {
      bounds = object.getBounds?.();
    }
    if (!bounds) return undefined;
    const { x: sx, y: sy } = this.density;
    // Leave room for the half-pixel snap of text and antialiased edges.
    const x = Math.max(0, Math.floor((bounds.x + offsetX) * sx) - 2);
    const y = Math.max(0, Math.floor((bounds.y + offsetY) * sy) - 2);
    const right = Math.min(this.overlay.width, Math.ceil((bounds.x + offsetX + bounds.width) * sx) + 2);
    const bottom = Math.min(this.overlay.height, Math.ceil((bounds.y + offsetY + bounds.height) * sy) + 2);
    return right > x && bottom > y ? { x, y, width: right - x, height: bottom - y } : null;
  }

  private clear(): void {
    this.painter.gameContext.clearRect(0, 0, this.overlay.width, this.overlay.height);
  }

  /** Retain the original draw order, including overlap between damage and panels. */
  private changedRegions(camera: Camera): Rect[] | undefined {
    const { matrix } = camera as Camera & { matrix: Matrix };
    const view = [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f, camera.scrollX, camera.scrollY, camera.alpha];
    const reset = this.dirty || view.some((value, i) => value !== this.cameraState[i]);
    let full = reset;
    this.cameraState = view;
    const local = !this.paper && !camera.scrollX && !camera.scrollY && matrix.a === 1 && matrix.d === 1 && !matrix.b && !matrix.c;
    const regions: Rect[] = [];
    const add = (bounds: Rect | null | undefined) => {
      if (full || bounds === null) return;
      if (!bounds || !local) { full = true; return; }
      for (let i = regions.length - 1; i >= 0; i--) {
        if (!intersects(regions[i], bounds)) continue;
        bounds = join(regions[i], bounds);
        regions.splice(i, 1);
        i = regions.length;
      }
      regions.push(bounds);
    };
    const pass = ++this.pass;
    let previousIndex = -1;
    for (const [index, object] of this.ink.entries()) {
      const old = this.previous.get(object);
      const { x, y, alpha, depth, rotation, scaleX, scaleY, frame, width, height,
        displayOriginX: originX, displayOriginY: originY } = object;
      if (old) {
        if (old.index < previousIndex) add(old.bounds);
        previousIndex = Math.max(previousIndex, old.index);
        if (!reset && !this.edits.has(object) && old.x === x && old.y === y && old.alpha === alpha && old.depth === depth &&
          old.rotation === rotation && old.scaleX === scaleX && old.scaleY === scaleY && old.frame === frame &&
          old.width === width && old.height === height && old.originX === originX && old.originY === originY) {
          old.index = index;
          old.pass = pass;
          continue;
        }
        add(old.bounds);
      }
      const bounds = local ? this.boundsOf(object, matrix.e, matrix.f) : undefined;
      this.previous.set(object, { x, y, scaleX, scaleY, rotation, alpha, depth, frame, width, height, originX, originY, bounds, index, pass });
      add(bounds);
    }
    for (const [object, state] of this.previous) {
      if (state.pass === pass) continue;
      add(state.bounds);
      this.previous.delete(object);
    }
    return full ? undefined : regions;
  }

  private paint(camera: Camera): void {
    const regions = this.wasMultiCamera ? undefined : this.changedRegions(camera);
    this.edits.clear();
    if (regions?.length === 0) {
      // Keep the ordering for hit testing when the retained image is reused.
      for (const object of this.ink) camera.addToRenderList(object);
      return;
    }
    const ctx = this.painter.gameContext;
    if (regions) {
      for (const { x, y, width, height } of regions) ctx.clearRect(x, y, width, height);
    } else if (!this.wasMultiCamera) this.clear();
    const { x: sx, y: sy } = this.density;
    const { matrix } = camera as Camera & { matrix: Matrix };
    const { a, b, c, d, e, f } = matrix;
    ctx.save();
    if (regions) {
      ctx.beginPath();
      for (const { x, y, width, height } of regions) ctx.rect(x, y, width, height);
      ctx.clip();
    } else if (this.wasMultiCamera) {
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
      const bounds = this.previous.get(object)?.bounds;
      if (regions && (bounds === null || bounds && !regions.some(region => intersects(bounds, region)))) {
        camera.addToRenderList(object);
        continue;
      }
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

export function useDevicePixels(scene: Phaser.Scene, paper: boolean, inkCamera?: string): void {
  active.set(scene, new DeviceUi(scene, paper, inkCamera));
}
