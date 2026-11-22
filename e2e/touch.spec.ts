import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Tablet project only (playwright.config.ts): a 1024x768 touch viewport, the
// canvas fitted at 1024 / 960 with letterboxing above and below. Every input
// is a real tap (page.touchscreen.tap) at the page point canvasToPage() gives
// for a canvas-space point. Numbers come from the verified simulation: one
// Musketeer at cell (7,5) in wave 1 ends with 14 lives and 83 gold.

type Cell = { col: number; row: number };
type Rect = { x: number; y: number; width: number; height: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);
const toPage = (page: Page, x: number, y: number) =>
  page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [x, y]);

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('game');
}

/** Tap a canvas-space point. */
async function tapAt(page: Page, x: number, y: number): Promise<void> {
  const p = await toPage(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}

/** Tap the centre of a named rectangle from uiRects(); fails if it is not there. */
async function tap(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await tapAt(page, r.x + r.width / 2, r.y + r.height / 2);
}

const tapCell = (page: Page, c: Cell) => tapAt(page, c.col * 32 + 16, c.row * 32 + 16);

/** A canvas rectangle's size in page pixels. */
async function pageSize(page: Page, r: Rect): Promise<{ width: number; height: number }> {
  const a = await toPage(page, r.x, r.y);
  const b = await toPage(page, r.x + r.width, r.y + r.height);
  return { width: b.x - a.x, height: b.y - a.y };
}

const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };

test('canvas fits 1024x768 with letterboxing: scale 1024/960, centred vertically', async ({ page }) => {
  await startGame(page);
  const tl = await toPage(page, 0, 0);
  const br = await toPage(page, 960, 580);
  expect(tl.x).toBeCloseTo(0, 1);
  expect(br.x).toBeCloseTo(1024, 1);
  expect(br.y - tl.y).toBeCloseTo((580 * 1024) / 960, 0);
  // Phaser rounds the centring margin to whole pixels.
  expect(Math.abs(tl.y - (768 - (580 * 1024) / 960) / 2)).toBeLessThanOrEqual(1);
});

test('two-tap placement: pick by tap, arm (7,5), build on the second tap, move the ghost, clear wave 1', async ({ page }) => {
  await startGame(page);

  await tap(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', isTouch: true, armedCell: null, panelOpen: false });

  // First tap: ghost and range at (7,5), armed, nothing built.
  await tapCell(page, C75);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', hoverCell: C75, armedCell: C75, isTouch: true });
  let s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);

  // Second tap on the same cell builds; the pick stays and the arm clears.
  await tapCell(page, C75);
  s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer' })]);
  expect(s.gold).toBe(50);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', armedCell: null });

  // One tap on another cell arms it; nothing is built.
  await tapCell(page, C95);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', hoverCell: C95, armedCell: C95 });
  expect((await state(page)).towers).toHaveLength(1);

  await tap(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 1 });
  await step(page, 2005);
  // Milestone 25c: the Musketeer kills all 20 wave 1 Goblins: 50 + 20 x 2 + 25.
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 20, gold: 115 });

  // Select the tower by tap (clear the pick first: the bar button toggles it).
  await tap(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBeNull();
  await tapCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
  const r = await rects(page);
  expect(r['panel:close']).toMatchObject({ width: 42, height: 42 });
  await tap(page, 'panel:close');
  expect(await ui(page)).toMatchObject({ selectedCell: null, panelOpen: false });
  expect((await state(page)).towers).toHaveLength(1);
});

test('a tap on a path cell shows the red cell and arms nothing; a tap moves the ghost', async ({ page }) => {
  await startGame(page);
  await tap(page, 'bar:musketeer');
  await tapCell(page, C75);
  expect((await ui(page)).armedCell).toEqual(C75);
  const path: Cell = { col: 2, row: 7 }; // (80, 240) is on the trail
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(2, 7, 'musketeer'))).toEqual({
    ok: false,
    reason: 'not-buildable',
  });
  await tapCell(page, path);
  expect(await ui(page)).toMatchObject({ hoverCell: path, armedCell: null });
  // A tap on (7,5) now only arms again: the red tap disarmed it.
  await tapCell(page, C75);
  expect(await ui(page)).toMatchObject({ armedCell: C75 });
  expect((await state(page)).towers).toEqual([]);
});

test('tapping the map outside the open panel closes it', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  await tapCell(page, C75);
  expect((await ui(page)).panelOpen).toBe(true);
  await tapCell(page, { col: 20, row: 1 });
  expect(await ui(page)).toMatchObject({ panelOpen: false, selectedCell: null, pick: null });
});

test('every button is at least 44 px tall on the page; no portrait card in landscape', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  await tapCell(page, C75); // open the panel so its buttons are listed
  const r = await rects(page);
  const names = Object.keys(r);
  expect(names).toEqual(expect.arrayContaining(['startWave', 'speed', 'bar:musketeer', 'panel:upgrade', 'panel:sell', 'panel:close']));
  for (const n of names) {
    const size = await pageSize(page, r[n]);
    expect(size.height, `${n} height on the page`).toBeGreaterThanOrEqual(44);
    expect(size.width, `${n} width on the page`).toBeGreaterThanOrEqual(44);
  }
  // Play again, on the end screen of a fresh game.
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).runScript('lazyBuild'));
  const end = (await rects(page)).playAgain;
  expect(end).toBeTruthy();
  expect((await pageSize(page, end)).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => window.__tarpit!.portraitCardVisible())).toBe(false);
});

test('the title menu starts on a tap on Play (milestone 25)', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
});

test('the title menu: tap Hard, then Play, starts a Hard game (milestone 25)', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await tap(page, 'title:hard');
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('title');
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  expect(await state(page)).toMatchObject({ difficulty: 'hard', gold: 80, lives: 15 });
  const r = await rects(page);
  expect(r).not.toHaveProperty('title:play');
});

// Non-test mode: the real loop runs, so the pause is observable.
test('portrait shows the turn-your-device card and stops ticking; landscape hides it', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  const tick = () =>
    page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { tick: number } }).state.tick);
  const visible = () => page.evaluate(() => window.__tarpit!.portraitCardVisible());

  expect(await visible()).toBe(false);
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.waitForFunction(() => window.__tarpit!.portraitCardVisible());
  await expect(page.locator('#rotate-card')).toBeVisible();
  await expect(page.locator('#rotate-card')).toContainText('Turn your device sideways');
  const t0 = await tick();
  await page.waitForTimeout(500);
  expect(await tick()).toBe(t0);

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.waitForFunction(() => !window.__tarpit!.portraitCardVisible());
  await expect(page.locator('#rotate-card')).toBeHidden();
  const t1 = await tick();
  await page.waitForTimeout(300);
  expect(await tick()).toBeGreaterThan(t1);
});
