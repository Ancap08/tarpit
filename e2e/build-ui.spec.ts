import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Build, upgrade and sell through real mouse clicks at the rectangles
// window.__tarpit.uiRects() reports. Time is frozen (?test=1) and driven by
// step(). Wave numbers come from the verified simulation: one Musketeer at
// spot 2 in wave 1 ends with 14 lives and 83 gold.

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('game');
}

const state = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).state());
const ui = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);

/** Click the centre of a named rectangle from uiRects(); fails if it is not there. */
async function click(page: Page, name: string): Promise<void> {
  const r = await page.evaluate((n) => (window.__tarpit as TarpitTestApi).uiRects()[n], name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

test('build a Musketeer at spot 2 through the menu, then clear wave 1', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:2');
  expect(await ui(page)).toEqual({ activeSpot: 2, selectedSpot: null, menuOpen: true, panelOpen: false });

  await click(page, 'menu:musketeer');
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ spotId: 2, type: 'musketeer', upgraded: false })]);
  expect(s.gold).toBe(50);
  expect(await ui(page)).toMatchObject({ activeSpot: null, menuOpen: false });
  const rects = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects());
  expect(rects['menu:musketeer']).toBeUndefined();

  await click(page, 'startWave');
  await step(page, 2005);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 14, gold: 83 });
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).hudText())).toMatchObject({ gold: 'Gold 83' });

  // Select, upgrade, sell.
  await click(page, 'spot:2');
  expect(await ui(page)).toEqual({ activeSpot: null, selectedSpot: 2, menuOpen: false, panelOpen: true });
  await click(page, 'panel:upgrade');
  expect((await state(page)).towers).toEqual([expect.objectContaining({ spotId: 2, upgraded: true, spent: 85 })]);
  expect((await state(page)).gold).toBe(48);
  expect(await ui(page)).toMatchObject({ selectedSpot: 2, panelOpen: true });

  // Upgrade again does nothing: the button reads "Upgraded" and is greyed.
  await click(page, 'panel:upgrade');
  expect((await state(page)).gold).toBe(48);

  await click(page, 'panel:sell');
  const after = await state(page);
  expect(after.towers).toEqual([]);
  expect(after.gold).toBe(48 + 59);
  expect(await ui(page)).toEqual({ activeSpot: null, selectedSpot: null, menuOpen: false, panelOpen: false });

  // Spot 2 is empty again: clicking it opens the build menu.
  await click(page, 'spot:2');
  expect(await ui(page)).toMatchObject({ activeSpot: 2, menuOpen: true });
});

test('an unaffordable button is greyed and does nothing; clicking the map closes the menu', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:2');
  await click(page, 'menu:musketeer');
  await click(page, 'spot:2');
  await click(page, 'panel:upgrade');
  expect((await state(page)).gold).toBe(15);
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().gold = 45; // test setup: Cannon (80) unaffordable
  });

  await click(page, 'spot:4');
  expect(await ui(page)).toMatchObject({ activeSpot: 4, menuOpen: true, panelOpen: false });
  await click(page, 'menu:cannon');
  expect((await state(page)).towers.map((t) => t.spotId)).toEqual([2]);
  expect((await state(page)).gold).toBe(45);
  expect(await ui(page)).toMatchObject({ activeSpot: 4, menuOpen: true });

  // Far from any spot, the path's start and the HUD.
  await page.mouse.click(900, 400);
  expect(await ui(page)).toEqual({ activeSpot: null, selectedSpot: null, menuOpen: false, panelOpen: false });
});

test('Escape closes the menu and the panel; another spot moves the menu', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:2');
  expect(await ui(page)).toMatchObject({ activeSpot: 2, menuOpen: true });
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject({ activeSpot: null, menuOpen: false });

  await click(page, 'spot:2');
  await click(page, 'spot:3');
  expect(await ui(page)).toMatchObject({ activeSpot: 3, menuOpen: true });
  const rects = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects());
  // Spot 3 is at (240, 240); spot 4 blocks its right side, so the menu sits
  // to its left, centred on it.
  expect(rects['menu:cannon'].x + rects['menu:cannon'].width).toBeLessThan(240);
  expect(rects['menu:cannon'].y + rects['menu:cannon'].height / 2).toBe(240);

  await click(page, 'menu:musketeer');
  await click(page, 'spot:3');
  expect(await ui(page)).toMatchObject({ selectedSpot: 3, panelOpen: true });
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject({ selectedSpot: null, panelOpen: false });
});

test('clicking a HUD button closes the menu and still works', async ({ page }) => {
  await startGame(page);
  await click(page, 'spot:2');
  await click(page, 'speed');
  expect(await ui(page)).toMatchObject({ menuOpen: false });
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).speed())).toBe(2);
});

test('build during a wave', async ({ page }) => {
  await startGame(page);
  await click(page, 'startWave');
  await step(page, 100);
  await click(page, 'spot:0');
  await click(page, 'menu:musketeer');
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ spotId: 0, type: 'musketeer' })]);
  expect(s).toMatchObject({ phase: 'wave', wave: 1, gold: 50 });
});
