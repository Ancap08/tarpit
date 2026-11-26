import type Phaser from 'phaser';

type Camera = Phaser.Cameras.Scene2D.Camera;
type Matrix = Phaser.GameObjects.Components.TransformMatrix;

const artDensity = new WeakMap<Phaser.Scene, number>();

export function setFieldArtDensity(scene: Phaser.Scene, density?: number): void {
  if (density === undefined) artDensity.delete(scene);
  else artDensity.set(scene, density);
}

/**
 * The portrait frame has more space for the controls than the legacy game.
 * Fit the backing pixels independently of the logical cameras and input.
 * The sharper pieces can use the screen's pixels, up to their source density.
 */
export function fitBattleBuffer(scene: Phaser.Scene) {
  const { renderer, game, scale } = scene;
  const maxArtDensity = artDensity.get(scene);
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
      const pixels = (logical: number, css: number) => Math.max(1, Math.round(maxArtDensity
        ? Math.min(logical * maxArtDensity, css * devicePixelRatio) : logical * factor));
      const width = pixels(scale.width, scale.displaySize.width);
      const height = pixels(scale.height, scale.displaySize.height);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      // CanvasRenderer clears using its stored dimensions. On the Keep's
      // transparent field, uncleared backing pixels would retain old poses.
      if (maxArtDensity && painter && (painter.width !== width || painter.height !== height)) painter.resize(width, height);
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
      const { width, height } = scale.baseSize;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        renderer.resize(width, height);
      } else if (maxArtDensity && painter && (painter.width !== width || painter.height !== height)) {
        painter.resize(width, height);
      }
    },
  };
}

/** The Keep keeps its original interface and two cameras. Only the field
 * buffer needs the device scale when it draws the sharper pieces. */
export function fitKeepPieces(scene: Phaser.Scene): void {
  const buffer = fitBattleBuffer(scene);
  const { scale, renderer } = scene;
  const render = renderer.render;
  renderer.render = (owner, children, camera) => {
    if (owner === scene) buffer.draw(camera, () => render.call(renderer, owner, children, camera));
    else render.call(renderer, owner, children, camera);
  };
  buffer.fit();
  scale.on('resize', buffer.fit);
  scene.events.once('shutdown', () => {
    scale.off('resize', buffer.fit);
    renderer.render = render;
    buffer.dispose();
  });
}
