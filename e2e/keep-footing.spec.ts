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

// Visual landmarks in the board-local image. These start at the door and
// continue past the apron into the original paving, including level 22's
// approach from the opposite side. The sprite is part of the sample.
const levels = [21, 22, 23, 24, 25] as const;
const approaches = {
  landscape: {
    21: [[-2, 12], [8, 23], [23, 40], [25, 60], [28, 86], [43, 104]],
    22: [[-2, 12], [10, 17], [25, 21], [46, 25], [68, 27], [90, 33], [110, 43], [129, 60]],
    23: [[-2, 12], [-2, 28], [2, 44], [15, 58], [28, 71], [51, 81]],
    24: [[-2, 12], [6, 23], [14, 40], [15, 58], [21, 79], [40, 100]],
    25: [[-2, 12], [6, 23], [11, 41], [10, 58], [21, 79], [39, 100]],
  },
  portrait: {
    21: [[-2, 12], [-14, 22], [-33, 32], [-55, 34], [-76, 35], [-96, 42], [-116, 55]],
    22: [[-2, 12], [12, 23], [30, 33], [48, 42], [57, 57], [54, 77], [36, 93]],
    23: [[-2, 12], [-16, 22], [-36, 28], [-55, 33], [-72, 42], [-82, 62], [-85, 80]],
    24: [[-2, 12], [-15, 22], [-34, 28], [-54, 29], [-76, 32], [-95, 44], [-113, 56]],
    25: [[-2, 12], [-15, 22], [-35, 27], [-55, 25], [-74, 27], [-93, 37], [-110, 58]],
  },
};

async function footingPixels(page: Page, route: number[][]) {
  return page.evaluate(route => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const keep = scene['keep']!, gate = keep.outerGate!, surround = keep['surround'];
    const sillX = 130, sillY = 22;
    const sample = document.createElement('canvas');
    sample.width = 270;
    sample.height = 160;
    const ctx = sample.getContext('2d')!;
    ctx.translate(sillX - gate.x, sillY - gate.y);
    for (const layer of [surround['ground'], ...surround['castle'], surround['road'], surround['gateBed']]) {
      if (layer) ctx.drawImage(layer, parseFloat(layer.style.left), parseFloat(layer.style.top));
    }
    const frame = gate.frame;
    ctx.drawImage(frame.source.image as HTMLImageElement, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      gate.x - gate.displayWidth * gate.originX, gate.y - gate.displayHeight * gate.originY,
      gate.displayWidth, gate.displayHeight);

    const { data } = ctx.getImageData(0, 0, sample.width, sample.height);
    const luminance = (x: number, y: number) => {
      const i = ((sillY + y) * sample.width + sillX + x) * 4;
      return .2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2];
    };
    // Walk the full corridor in short overlapping patches. A few dark
    // mortar joints are normal, but a whole patch of shadow or rock is a gap.
    let darkest = Infinity;
    const paving: [number, number][] = [];
    for (let i = 1; i < route.length; i++) {
      const [ax, ay] = route[i - 1], [bx, by] = route[i];
      const count = Math.ceil(Math.hypot(bx - ax, by - ay) / 3);
      for (let n = 0; n <= count; n++) {
        const x = Math.round(ax + (bx - ax) * n / count), y = Math.round(ay + (by - ay) * n / count);
        paving.push([x, y]);
        let stone = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (luminance(x + dx, y + dy) >= 59) stone++;
        }
        darkest = Math.min(darkest, stone / 49);
      }
    }
    // The slab ended in a hard lip. Scan both shoulders over three pixels
    // so the softer contact shadow does not count as a straight edge.
    const canvas = scene.game.canvas.getBoundingClientRect();
    const scaleX = canvas.width / scene.boardLayout.width;
    const scaleY = canvas.height / scene.boardLayout.height * scene.cameras.main.zoomY;
    let straight = 0;
    for (let y = 14; y <= 32; y++) for (const slope of [-.12, 0, .12]) {
      let run = 0;
      for (let x = -116; x <= 116; x++) {
        const edge = y + Math.round(slope * x);
        // The kerb is a continuous feature of the road, outside the rock.
        const onRoad = paving.some(([u, v]) => (u - x) ** 2 + (v - edge) ** 2 <= 22 ** 2);
        run = !onRoad && edge >= 12 && luminance(x, edge + 2) - luminance(x, edge - 1) >= 10 ? run + 1 : 0;
        straight = Math.max(straight, run * Math.hypot(scaleX, slope * scaleY));
      }
    }
    return { darkest, straight };
  }, route);
}

for (const { name, width, height } of views) {
  for (const level of levels) for (const ui of ['new', 'old']) {
    test(`level ${level} ${name}, ${ui} interface: the inbound paving reaches the sill over broken rock`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openKeep(page, level, true, ui);
      const { darkest, straight } = await footingPixels(page, approaches[name][level]);
      expect.soft(darkest, 'Continuous visible paving from the inbound road to the sill').toBeGreaterThanOrEqual(.45);
      expect(straight, 'Longest straight edge under the gatehouse (CSS px)').toBeLessThanOrEqual(33);
    });
  }
}

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

for (const { name, width, height } of views) for (const lightning of [false, true]) {
  test(`the ${name} siege ${lightning ? 'drops ground pools in lightning' : 'lights the ground immediately below low lamps'}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`/?test=1&ui=new&owner=1&keep=23&keepLightning=${Number(lightning)}`);
    await page.waitForFunction(() => !!window.__tarpit?.keep?.());
    const result = await page.evaluate(() => {
      const keep = (window.__tarpit!.game.scene.getScene('game') as GameScene)['keep']!;
      const gate = keep.outerGate!;
      // Lamp feet read from the ground plate, in map-local coordinates.
      const lampFeet = innerWidth < innerHeight
        ? [[280,930],[191,830],[209,704],[63,653],[15,734],[155,579],[311,776]]
        : [[903,184],[925,357],[810,448],[588,460],[677,439],[701,323],[635,347]];
      return {
        streetOffsets: keep['spill'].map(pool => Math.min(...lampFeet.map(([x,y]) => Math.hypot(pool.x - x, pool.y - y)))),
        gateOffsets: keep['barbicanSpill'].map(pool => Math.hypot(pool.x - gate.x - 29 * Math.sign(pool.x - gate.x),
          pool.y - gate.y - 9)),
        alpha: [...keep['spill'], ...keep['barbicanSpill']].map(pool => pool.alpha),
        exposure: !keep['surround']['litGround']!.hidden,
      };
    });
    expect(Math.max(...result.streetOffsets), 'Each street pool touches a painted bollard foot').toBeLessThanOrEqual(2);
    expect(Math.max(...result.gateOffsets), 'Each gate pool touches a barbican brazier foot').toBeLessThanOrEqual(2);
    expect(result.exposure).toBe(lightning);
    expect(result.alpha).toHaveLength(5);
    expect(result.alpha.every(value => lightning ? value === 0 : value > 0)).toBe(true);
  });
}
