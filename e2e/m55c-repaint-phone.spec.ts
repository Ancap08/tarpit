import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { press } from './campaign';
import { waitForTitle } from './title';

test.use({ viewport: { width: 390, height: 656 } });

test('battle damage leaves the unchanged status and dock pixels alone', async ({ page }) => {
  await page.goto('/?test=1&ui=new&look=painted');
  await waitForTitle(page);
  await press(page, 'title:play', true);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && window.__tarpit.uiRects().startWave);
  const samples = await page.evaluate(async () => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game') as GameScene;
    const state = scene.state;
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-interface-ink]')!;
    const { map } = scene.boardLayout;
    const density = canvas.height / scene.scale.height;
    const top = Math.floor(map.y * density);
    const bottom = Math.ceil((map.y + map.height) * density);
    const point = { x: map.x + map.width / 2, y: map.y + map.height / 2 };
    const ctx = canvas.getContext('2d')!;
    const clear = ctx.clearRect;
    let paint = { any: false, hud: false, full: false };
    ctx.clearRect = (x, y, width, height) => {
      paint.any = true;
      paint.hud ||= y < top || y + height > bottom;
      paint.full ||= x === 0 && y === 0 && width === canvas.width && height === canvas.height;
      clear.call(ctx, x, y, width, height);
    };
    const rendered = () => new Promise<void>(resolve => api.game.events.once('postrender', resolve));
    const readouts = () => [state.gold, state.lives, state.wave];
    const count = async (change?: (frame: number) => void) => {
      const detections = { any: 0, hud: 0, full: 0 };
      const values = new Set<string>();
      for (let frame = 0; frame < 24; frame++) {
        paint = { any: false, hud: false, full: false };
        change?.(frame);
        api.step!(1);
        await rendered();
        values.add(readouts().join('/'));
        for (const key of ['any', 'hud', 'full'] as const) detections[key] += Number(paint[key]);
      }
      return { ...detections, states: values.size };
    };
    try {
      api.spawnHorde!(40, 245);
      state.spawnedPerGroup.fill(100);
      await rendered();
      const idle = await count();
      const held = await count(frame => {
        if (frame % 6 === 0) scene['hitNumbers']!.hit(point, 3 + frame);
      });
      api.step!(60);
      await rendered();
      const changing = await count(frame => {
        if (frame === 4) state.gold += 1;
        if (frame === 10) state.lives -= 1;
        if (frame === 16) state.wave += 1;
      });
      return { idle, held, changing };
    } finally {
      ctx.clearRect = clear;
    }
  });
  console.log('Overlay repaint frames', JSON.stringify(samples));
  expect(samples.idle, 'untouched overlay during a fight').toEqual({ any: 0, hud: 0, full: 0, states: 1 });
  expect(samples.held.states).toBe(1);
  expect(samples.held.hud, 'unchanged HUD frames repainted while damage numbers animate').toBe(0);
  expect(samples.changing.states).toBe(4);
  expect(samples.changing.hud, 'HUD repaints on the three readout changes').toBe(3);
  expect(samples.changing.full, 'readout changes repaint only the affected area').toBe(0);
});
