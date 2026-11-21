import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Screenshot checks on frozen frames (?test=1: no time passes unless the
// test steps it). Baselines are generated on CI; local runs ignore them
// (ignoreSnapshots in playwright.config.ts).

async function open(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  // Let the first frame paint (and web fonts settle) before capturing.
  await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => r(null)))));
}

/** Wait two animation frames so the canvas shows the latest redraw. */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

test('title', async ({ page }) => {
  await open(page);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('title.png');
});

test('map at wave 0', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('map-wave0.png');
});

// 855 ticks into wave 1 the Cannon at spot 6 fired 3 ticks ago (its first
// shot, at tick 852), so its tracer and splash circle are mid-fade; five
// goblins are out and four are hurt. With these spots no single frame shows
// two shot types: the Musketeer at spot 2 fires every 60 ticks (392, 452,
// ...) with a 6-tick tracer, and the base Tar Pit first fires at tick 1453.
// Tick 855 was chosen by the coordinator over 395 (Musketeer tracer only)
// because the splash and hp bars cover more of the renderer.
const MID_WAVE_STEPS = 855;

test('mid wave 1 with three towers', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().gold = 1000; // test setup: afford all three towers
    t.build(2, 'musketeer');
    t.build(6, 'cannon');
    t.build(7, 'tarpit');
    t.startWave();
    t.step(steps);
    const s = t.state();
    return { enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 30).length };
  }, MID_WAVE_STEPS);
  expect(counts).toEqual({ enemies: 5, hurt: 4 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('mid-wave.png');
});
