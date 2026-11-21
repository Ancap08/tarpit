import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 10: Longbow, Mortar and Fire Pot exist in the simulation only.
// The renderer draws them with placeholder shapes and tracers (milestone 11
// replaces them) and must not throw; the build bar still has three buttons.

test('new tower types render with placeholders, fire through a wave, and stay off the bar', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());

  const bar = await page.evaluate(() => Object.keys((window.__tarpit as TarpitTestApi).uiRects()).filter((k) => k.startsWith('bar:')));
  expect(bar.sort()).toEqual(['bar:cannon', 'bar:musketeer', 'bar:tarpit']);

  const result = await page.evaluate(() => {
    const api = window.__tarpit as TarpitTestApi;
    api.state().gold = 1000;
    const built = [api.buildAt(2, 5, 'longbow'), api.buildAt(1, 9, 'firepot'), api.buildAt(10, 5, 'mortar')].map((r) => r.ok);
    const upgraded = api.upgradeAt(1, 9).ok;
    api.startWave();
    const fired = new Set<string>();
    for (let i = 0; i < 1200; i++) {
      api.step(1);
      for (const s of api.state().shots) fired.add(s.tower);
    }
    return { built, upgraded, fired: [...fired].sort() };
  });
  expect(result).toEqual({ built: [true, true, true], upgraded: true, fired: ['firepot', 'longbow', 'mortar'] });
  expect(errors).toEqual([]);
});
