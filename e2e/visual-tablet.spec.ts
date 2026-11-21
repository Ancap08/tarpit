import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Tablet project only: the map at wave 0 at 1024x768, full page, so the
// letterboxing above and below the fitted canvas is in the baseline.
// Baselines are generated on CI; local runs ignore them.

test('tablet map at wave 0', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))))));
  await expect(page).toHaveScreenshot('tablet-map-wave0.png', { fullPage: true });
});
