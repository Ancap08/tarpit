import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { waitForTitle } from './title';

// Milestone 14 verifier probes (tablet project only, see playwright.config.ts).
// Every input is a real tap at the page point canvasToPage() gives.

type Cell = { col: number; row: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);
const toPage = (page: Page, x: number, y: number) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [x, y]);

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}
async function tapAt(page: Page, x: number, y: number): Promise<void> {
  const p = await toPage(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}
async function tap(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, name).toBeTruthy();
  await tapAt(page, r.x + r.width / 2, r.y + r.height / 2);
}
const tapCell = (page: Page, c: Cell) => tapAt(page, c.col * 32 + 16, c.row * 32 + 16);
const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };
const cells = async (page: Page) => (await state(page)).towers.map((t) => t.cell);

test('(a) a tap on a non-buildable path cell with a pick arms nothing and builds nothing', async ({ page }) => {
  await startGame(page);
  await tap(page, 'bar:musketeer');
  const path: Cell = { col: 2, row: 7 };
  expect(await api(page, (a) => a.buildAt(2, 7, 'musketeer'))).toEqual({ ok: false, reason: 'not-buildable' });
  await tapCell(page, path);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', armedCell: null });
  await tapCell(page, path); // a second tap must not build either
  expect(await ui(page)).toMatchObject({ armedCell: null });
  expect(await cells(page)).toEqual([]);
  expect((await state(page)).gold).toBe(100);
});

test('(b) arm (7,5), then the bar button clears the pick: disarmed, no tower', async ({ page }) => {
  await startGame(page);
  await tap(page, 'bar:musketeer');
  await tapCell(page, C75);
  expect(await ui(page)).toMatchObject({ armedCell: C75 });
  await tap(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: null, armedCell: null, hoverCell: null });
  expect(await cells(page)).toEqual([]);
  // Re-picking and tapping (7,5) must arm again, not build.
  await tap(page, 'bar:musketeer');
  await tapCell(page, C75);
  expect(await ui(page)).toMatchObject({ armedCell: C75 });
  expect(await cells(page)).toEqual([]);
});

test('(c) arm (7,5), tap (9,5): armed moves, no tower; tap (9,5) again: tower at (9,5) only', async ({ page }) => {
  await startGame(page);
  await tap(page, 'bar:musketeer');
  await tapCell(page, C75);
  await tapCell(page, C95);
  expect(await ui(page)).toMatchObject({ armedCell: C95, hoverCell: C95 });
  expect(await cells(page)).toEqual([]);
  await tapCell(page, C95);
  expect(await cells(page)).toEqual([C95]);
  expect(await ui(page)).toMatchObject({ armedCell: null, pick: 'musketeer' });
});

test('(d) two-tap build works mid-wave', async ({ page }) => {
  await startGame(page);
  await tap(page, 'startWave');
  await step(page, 60);
  expect((await state(page)).phase).toBe('wave');
  await tap(page, 'bar:musketeer');
  await tapCell(page, C75);
  expect(await cells(page)).toEqual([]);
  await tapCell(page, C75);
  expect(await cells(page)).toEqual([C75]);
  expect((await state(page)).phase).toBe('wave');
});

test('(e) every uiRects() rect is at least 44 px tall on the page and inside the viewport', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  await tap(page, 'bar:longbow');
  await tap(page, 'bar:longbow');
  await tapCell(page, C75); // opens the panel
  const vp = page.viewportSize()!;
  const r = await rects(page);
  expect(Object.keys(r)).toContain('panel:close');
  for (const [n, c] of Object.entries(r)) {
    const a = await toPage(page, c.x, c.y);
    const b = await toPage(page, c.x + c.width, c.y + c.height);
    expect(b.y - a.y, `${n} page height`).toBeGreaterThanOrEqual(44);
    expect(a.x, n).toBeGreaterThanOrEqual(0);
    expect(a.y, n).toBeGreaterThanOrEqual(0);
    expect(b.x, n).toBeLessThanOrEqual(vp.width);
    expect(b.y, n).toBeLessThanOrEqual(vp.height);
  }
});

test.describe('(f) 1366x1024', () => {
  test.use({ viewport: { width: 1366, height: 1024 } });
  test('canvas offset and Start Wave still tappable', async ({ page }) => {
    await startGame(page);
    const scale = Math.min(1366 / 960, 1024 / 580);
    expect(scale).toBeCloseTo(1.423, 2);
    const o = await toPage(page, 0, 0);
    // The brief's formula; here it is ~0 because width is the limiting axis.
    expect(Math.abs(o.x - (1366 - 960 * scale) / 2)).toBeLessThanOrEqual(1);
    // Height is not limiting: the bars are top and bottom.
    expect(Math.abs(o.y - (1024 - 580 * scale) / 2)).toBeLessThanOrEqual(1);
    await tap(page, 'startWave');
    expect((await state(page)).phase).toBe('wave');
  });
});

// Milestone 32b: there is no card any more; portrait is a layout and the wave keeps running.
test('(g) portrait without test mode: the portrait layout and ticks; landscape: the landscape layout and ticks', async ({ page }) => {
  await page.goto('/');
  await waitForTitle(page);
  await tap(page, 'title:play'); // milestone 25: only Play starts the game
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  const tick = () => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { tick: number } }).state.tick);
  await tap(page, 'startWave'); // a wave is running, so ticks have something to do
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
  const t0 = await tick();
  await page.waitForTimeout(600);
  expect(await tick()).toBeGreaterThan(t0);
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
  const t1 = await tick();
  await page.waitForTimeout(600);
  expect(await tick()).toBeGreaterThan(t1);
});

// Milestone 25 verifier probe (g): the title menu by touch on the tablet.
test('(m25 g) tap Hard, tap Play: 80 gold, 15 lives; all four title buttons are at least 44 px tall on screen', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForTitle(page);
  // One frame, so the menu's buttons are in Phaser's input list before the first tap.
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const r = await rects(page);
  expect(Object.keys(r).sort()).toEqual(['title:easy', 'title:hard', 'title:look:classic', 'title:look:painted', 'title:map:meadow', 'title:map:riverbend', 'title:map:switchback', 'title:mute', 'title:normal', 'title:play']);
  for (const [name, rect] of Object.entries(r)) {
    const top = await toPage(page, rect.x, rect.y);
    const bottom = await toPage(page, rect.x + rect.width, rect.y + rect.height);
    // 42 canvas px x 1024 / 960 = 44.8 px on screen (milestone 27 map thumbnails: 72 -> 76.8).
    expect(bottom.y - top.y, name).toBeCloseTo(name.startsWith('title:map:') ? 76.8 : 44.8, 1);
    expect(bottom.y - top.y, name).toBeGreaterThanOrEqual(44);
    expect(bottom.x - top.x, name).toBeGreaterThanOrEqual(44);
  }
  await tap(page, 'title:hard');
  expect(await api(page, (a) => a.scene())).toBe('title'); // a tap on a level only selects it
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>())).toMatchObject({ scene: 'title', difficulty: 'hard' }); // milestone 26 adds bestLine
  // A tap on empty title space starts nothing (milestone 27: x 120, left of the map row, which now fills x 480).
  await tapAt(page, 120, 366);
  expect(await api(page, (a) => a.scene())).toBe('title');
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  expect(await state(page)).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15, wave: 0, tick: 0, towers: [] });
});
