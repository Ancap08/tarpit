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
// ...) with a 6-tick tracer, and the base Tar Pit first fires at tick 1412.
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

// All three enemy types with their hp bars, for Wolf and Troll coverage.
// Wave 8 is the only wave with Goblins, Wolves and Trolls together, so the
// test jumps there (state.wave = 7, then Start Wave) with 1000 gold and a
// Musketeer at spot 2, Cannon at 4, Tar Pit at 7 and Musketeer at 9. Tick
// 1200 was picked from a headless scan of every 30th tick: 8 Goblins, 5
// Wolves and 4 Trolls are out, 2 Trolls are hurt (green bars), 5 enemies are
// under 25% (red bars), 2 Wolves carry the tar ring, and no two enemies are
// closer than 14 px, so each shape and bar reads on its own. Earlier ticks
// bunch everyone near the cave; later ones lose the Wolves.
const ENEMIES_STEPS = 1200;

test('wave 8 with all three enemy types', async ({ page }) => {
  await open(page);
  const counts = await page.evaluate(async (steps) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const s = t.state();
    s.gold = 1000; // test setup: afford four towers
    s.wave = 7; // test setup: the next Start Wave plays wave 8
    t.build(2, 'musketeer');
    t.build(4, 'cannon');
    t.build(7, 'tarpit');
    t.build(9, 'musketeer');
    t.startWave();
    t.step(steps);
    const e = t.state().enemies;
    const of = (type: string) => e.filter((x) => x.type === type);
    return {
      wave: t.state().wave,
      goblins: of('goblin').length,
      wolves: of('wolf').length,
      trolls: of('troll').length,
      hurtTrolls: of('troll').filter((x) => x.hp < 500).length, // Troll max hp is 500
      slowed: e.filter((x) => x.slowTicksLeft > 0).length,
    };
  }, ENEMIES_STEPS);
  expect(counts).toEqual({ wave: 8, goblins: 8, wolves: 5, trolls: 4, hurtTrolls: 2, slowed: 2 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('enemies.png');
});

/** Click the centre of a named rectangle from uiRects(). */
async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

test('build menu with the Cannon range preview', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await click(page, 'spot:2');
  const r = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects()['menu:cannon']);
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui())).toMatchObject({ activeSpot: 2, menuOpen: true });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('build-menu.png');
});

test('upgraded Musketeer selected with its panel and range', async ({ page }) => {
  await open(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await click(page, 'spot:2');
  await click(page, 'menu:musketeer');
  await click(page, 'spot:2');
  await click(page, 'panel:upgrade');
  // Park the pointer on empty grass so no hover tint shows.
  await page.mouse.move(900, 440);
  const s = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    return { ui: t.ui(), towers: t.state().towers, gold: t.state().gold };
  });
  expect(s.ui).toMatchObject({ selectedSpot: 2, panelOpen: true });
  expect(s.towers).toEqual([expect.objectContaining({ spotId: 2, type: 'musketeer', upgraded: true })]);
  expect(s.gold).toBe(15);
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('tower-selected.png');
});

// End screens: the HUD under the veil shows the final numbers.
test('win screen after the sound build', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    const phase = t.runScript('soundBuild');
    return { phase, screen: t.endScreen(), lives: t.state().lives, gold: t.state().gold };
  });
  expect(end).toEqual({ phase: 'won', screen: 'won', lives: 11, gold: 253 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('won.png');
});

test('lose screen with no towers', async ({ page }) => {
  await open(page);
  const end = await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    for (let i = 0; i < 120 && t.state().phase !== 'lost'; i++) {
      if (t.state().phase === 'setup') t.startWave();
      t.step(500);
    }
    return { screen: t.endScreen(), wave: t.state().wave, lives: t.state().lives };
  });
  expect(end).toEqual({ screen: 'lost', wave: 2, lives: 0 });
  await settle(page);
  await expect(page.locator('canvas')).toHaveScreenshot('lost.png');
});
