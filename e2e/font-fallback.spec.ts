import { expect, test } from '@playwright/test';
import { api, mapPress, press } from './campaign';
import { waitForTitle } from './title';

test('blocked font downloads still permit a Free play purchase and a full wave', async ({ page }) => {
  const requests = new Set<string>();
  await page.route(/\.woff2(?:$|\?)/, (route) => {
    // Vite's development JS URL modules are scripts; block the font bytes.
    if (route.request().resourceType() !== 'font') return route.continue();
    requests.add(route.request().url());
    return route.abort();
  });
  await page.goto('/?test=1');
  await waitForTitle(page);
  expect(requests.size).toBe(2);
  expect(await page.evaluate(() => [...document.fonts].length)).toBe(0);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  await press(page, 'bar:musketeer');
  await mapPress(page, 7, 5);
  expect(await api(page, (t) => t.state().towers)).toMatchObject([{ type: 'musketeer' }]);
  await press(page, 'startWave');
  await api(page, (t) => t.step(3100));
  expect(await api(page, (t) => t.state())).toMatchObject({ phase: 'setup', wave: 1, lives: 20, gold: 115 });
});
