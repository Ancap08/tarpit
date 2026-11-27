import { expect, test, type Page } from '@playwright/test';
import type Phaser from 'phaser';
import type { GameScene } from '../src/game/GameScene';

async function openKeep(page: Page, level: number, still = true, ui = 'new'): Promise<void> {
  await page.goto(`/?${still ? 'test=1&' : ''}ui=${ui}&owner=1&keep=${level}`);
  await page.waitForFunction(() => !!window.__tarpit?.keep?.());
}

const views = [
  { name: 'landscape', width: 1280, height: 800, x: 44, depth: 8 },
  { name: 'portrait', width: 390, height: 844, x: 12, depth: 16 },
] as const;

for (const { name, width, height, x, depth } of views) {
  test(`the ${name} curtain has solid rock between the outer buttresses`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openKeep(page, 21);
    const alpha = await page.evaluate(({ x, depth }) => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      const keep = scene['keep']!;
      const wall = keep['surround']['castle'][2];
      const pixels = wall.getContext('2d')!.getImageData(
        Math.round(x - parseFloat(wall.style.left)) - 2,
        Math.round(keep['gate'].y + depth - parseFloat(wall.style.top)) - 2, 5, 5).data;
      return Math.min(...pixels.filter((_, i) => i % 4 === 3));
    }, { x, depth });
    expect(alpha, 'Rock between the buttress feet occludes the crag').toBeGreaterThanOrEqual(250);
  });
}

test('the east approach remains visible below the barbican sill in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openKeep(page, 21);
  const paved = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const keep = scene['keep']!, sill = keep.outerGate!;
    // Sample the uncovered strip just in front of the visual threshold.
    // Include the wall and deck in the composite: either can mask a road
    // that appears correctly aligned when the ground plate is viewed alone.
    const surface = keep['surround'].stillSurface();
    const pixels = surface.getContext('2d')!.getImageData(
      Math.round(sill.x - parseFloat(surface.style.left)) - 8,
      Math.round(sill.y - parseFloat(surface.style.top)) + 14, 18, 7).data;
    return pixels.filter((red, i) => i % 4 === 0 &&
      .2126 * red + .7152 * pixels[i + 1] + .0722 * pixels[i + 2] >= 65).length / 126;
  });
  expect(paved, 'Visible paving spans the approach lip beneath the arch').toBeGreaterThanOrEqual(.65);
});

const levels = [21, 22, 23, 24, 25] as const;

interface FootingTrace {
  worstBed: number;
  visibleFrames: number;
  frames: number;
  maxZoom: number;
  firstOpening: number;
}
type TracedWindow = Window & { footingTrace: Promise<FootingTrace>; startFootingWave: () => void };

async function traceFooting(page: Page, wave: boolean): Promise<void> {
  await page.addInitScript(wave => {
    const traced = window as unknown as TracedWindow;
    traced.footingTrace = new Promise<FootingTrace>(resolve => {
      // Subscribe before Phaser renders the first game frame, even when the
      // visit loads too quickly for an assertion after page.goto().
      Object.defineProperty(window, '__tarpit', {
        configurable: true,
        set(api: NonNullable<Window['__tarpit']>) {
          Object.defineProperty(window, '__tarpit', { value: api, writable: true, configurable: true });
          let armed = !wave;
          const trace = { worstBed: 0, visibleFrames: 0, frames: 0, maxZoom: 0, firstOpening: 0 };
          function measure() {
            if (!armed || !api.keep?.()) return;
            const s = api.game.scene.getScene('game') as GameScene;
            const keep = s['keep']!, gate = keep.outerGate!, surround = keep['surround'];
            const camera = s.cameras.main as Phaser.Cameras.Scene2D.Camera & {
              matrix: Phaser.GameObjects.Components.TransformMatrix;
            };
            const layout = s.boardLayout;
            const g = gate.getWorldTransformMatrix();
            const bed = surround['gateBed']!;
            const layer = bed.hidden ? surround['still'] : bed;
            if (layer && !layer.hidden) {
              const rect = layer.getBoundingClientRect();
              const canvas = s.game.canvas.getBoundingClientRect();
              // Check the sill and a second point in the bed. Matching the
              // sill by itself can miss a scale error about that point.
              for (const [dx, dy] of [[0, 0], [24, 32]]) {
                const p = camera.matrix.transformPoint(g.e + dx - camera.scrollX, g.f + dy - camera.scrollY, { x: 0, y: 0 });
                const x = canvas.x + p.x * canvas.width / layout.width;
                const y = canvas.y + p.y * canvas.height / layout.height;
                const u = gate.x + dx - parseFloat(layer.style.left);
                const v = gate.y + dy - parseFloat(layer.style.top);
                trace.worstBed = Math.max(trace.worstBed,
                  Math.hypot(rect.x + u * rect.width / layer.width - x, rect.y + v * rect.height / layer.height - y));
              }
              trace.visibleFrames++;
            }
            trace.maxZoom = Math.max(trace.maxZoom, camera.zoomY);
            if (++trace.frames === 1) {
              trace.firstOpening = keep['opening'];
              setTimeout(() => {
                api.game.events.off('postrender', measure);
                resolve(trace);
              }, 2_000);
            }
          }
          api.game.events.on('postrender', measure);
          traced.startFootingWave = () => {
            armed = true;
            const scene = api.game.scene.getScene('game') as GameScene;
            if (!scene.startWave().ok) throw new Error('Could not start the wave');
          };
        },
      });
    });
  }, wave);
}

for (const level of levels) for (const ui of ['new', 'old']) {
  test(`level ${level} live landscape opening keeps the apron registered (${ui} interface)`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await traceFooting(page, false);
    await openKeep(page, level, false, ui);
    const { worstBed, visibleFrames, frames, firstOpening } =
      await page.evaluate(() => (window as unknown as TracedWindow).footingTrace);
    expect(frames).toBeGreaterThan(1);
    expect(visibleFrames).toBeGreaterThan(1);
    expect(firstOpening).toBeGreaterThan(.95);
    expect(worstBed, 'Visible apron registration throughout the opening (CSS px)').toBeLessThanOrEqual(.15);
  });

  for (const height of [844, 656]) {
    test(`level ${level} at 390×${height} keeps the apron registered as the battle camera scales (${ui} interface)`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height });
      await traceFooting(page, true);
      await openKeep(page, level, false, ui);
      const { worstBed, frames, visibleFrames, maxZoom } = await page.evaluate(() => {
        const traced = window as unknown as TracedWindow;
        traced.startFootingWave();
        return traced.footingTrace;
      });
      expect(frames).toBeGreaterThan(1);
      expect(visibleFrames).toBeGreaterThan(1);
      expect(maxZoom).toBe(1.5);
      expect(worstBed, 'Apron registration during and after the portrait camera scale (CSS px)').toBeLessThanOrEqual(.15);
    });
  }
}

test('leaving the portrait keep removes its camera listener', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openKeep(page, 25);
  const removed = await page.evaluate(async () => {
    const { game, startLevel } = window.__tarpit!;
    const keep = (game.scene.getScene('game') as GameScene)['keep']!;
    const callback = keep['alignGround'];
    const registered = game.renderer.listeners('postrender').includes(callback);
    await startLevel!(1);
    return registered && !game.renderer.listeners('postrender').includes(callback);
  });
  expect(removed).toBe(true);
});
