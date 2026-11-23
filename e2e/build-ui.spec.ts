import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// The build bar and placement through real mouse clicks: bar buttons at the
// rectangles window.__tarpit.uiRects() reports, map cells at their centres
// (col * 32 + 16, row * 32 + 16). Time is frozen (?test=1) and driven by
// step(). Numbers come from the verified simulation: one Musketeer at cell
// (7,5) in wave 1 ends with 14 lives and 83 gold; Musketeer 50, upgrade 35,
// sell refund floor(85 * 7 / 10) = 59. Milestone 9 merges the milestone 4
// implementer and verifier specs; the verifier's probes are marked (a)-(f).

type Cell = { col: number; row: number };
const C75: Cell = { col: 7, row: 5 };

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).scene())).toBe('game');
}

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);
const setGold = (page: Page, gold: number) =>
  page.evaluate((g) => {
    (window.__tarpit as TarpitTestApi).state().gold = g; // test setup through the live object
  }, gold);
const cursor = (page: Page) => page.evaluate(() => document.querySelector('canvas')?.style.cursor ?? '');
/** Wait two animation frames so update() has redrawn (it greys the bar from the live gold). */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

/** Click the centre of a named rectangle from uiRects(); fails if it is not there. */
async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const centre = (c: Cell) => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });
async function clickCell(page: Page, c: Cell): Promise<void> {
  const p = centre(c);
  await page.mouse.click(p.x, p.y);
}

const NO_UI = { pick: null, selectedCell: null, panelOpen: false };

test('pick Musketeer, place it on (7,5) with a real click, then clear wave 1', async ({ page }) => {
  await startGame(page);
  expect(await ui(page)).toMatchObject(NO_UI);

  await click(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', panelOpen: false });

  await clickCell(page, C75);
  let s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer', upgraded: false })]);
  expect(s.gold).toBe(50);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', hoverCell: C75, panelOpen: false });

  // A path cell: nothing happens and the pick stays.
  await clickCell(page, { col: 2, row: 7 });
  s = await state(page);
  expect(s.towers.length).toBe(1);
  expect(s.gold).toBe(50);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', panelOpen: false });

  // The occupied cell: no second build. A click on a tower with a pick active
  // clears the pick and selects that tower.
  await clickCell(page, C75);
  s = await state(page);
  expect(s.towers.length).toBe(1);
  expect(s.gold).toBe(50);
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: C75, panelOpen: true });

  // Re-pick Musketeer (the bar click also closes the panel). Cannon (80) is
  // not pickable with 50 gold, so the pick stays Musketeer.
  await click(page, 'bar:musketeer');
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', panelOpen: false });
  await click(page, 'bar:cannon');
  expect(await ui(page)).toMatchObject({ pick: 'musketeer' });
  expect((await state(page)).gold).toBe(50);

  // Escape clears the pick.
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject(NO_UI);

  await click(page, 'startWave');
  await step(page, 3100);
  // Milestone 28: Goblins every 2.5 s; the Musketeer kills all 20 (the wave clears after 3062 ticks): 50 + 20 x 2 + 25.
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 1, lives: 20, gold: 115 });
  expect(await api(page, (a) => a.hudText())).toMatchObject({ gold: 'Gold 115', lives: 'Lives 20' });
});

test('clicking the active bar button again clears the pick; only one pick at a time', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer');
  await click(page, 'bar:tarpit');
  expect((await ui(page)).pick).toBe('tarpit');
  await click(page, 'bar:tarpit');
  expect((await ui(page)).pick).toBeNull();
});

test('(e) two Musketeers with one pick; at 0 gold the pick clears and the button is greyed', async ({ page }) => {
  await startGame(page);
  await setGold(page, 100);
  await click(page, 'bar:musketeer');
  await clickCell(page, { col: 2, row: 5 });
  expect((await ui(page)).pick).toBe('musketeer');
  await clickCell(page, { col: 2, row: 9 });
  const s = await state(page);
  expect(s.towers.map((t) => t.cell)).toEqual([
    { col: 2, row: 5 },
    { col: 2, row: 9 },
  ]);
  expect(s.gold).toBe(0);
  expect((await ui(page)).pick).toBeNull();

  // Greyed: a click does not pick it.
  await click(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBeNull();

  // The greying follows the live gold.
  await setGold(page, 50);
  await settle(page);
  await click(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBe('musketeer');
});

test('build during a wave through the bar', async ({ page }) => {
  await startGame(page);
  await click(page, 'startWave');
  await step(page, 100);
  await click(page, 'bar:musketeer');
  await clickCell(page, { col: 2, row: 5 });
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: { col: 2, row: 5 }, type: 'musketeer' })]);
  expect(s).toMatchObject({ phase: 'wave', wave: 1, gold: 50 });
});

test('(a) select the tower at (7,5), upgrade and sell with the real panel', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer');
  await clickCell(page, C75);
  await page.keyboard.press('Escape');

  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: C75, panelOpen: true });
  await click(page, 'panel:upgrade');
  let s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, upgraded: true, spent: 85 })]);
  expect(s.gold).toBe(15);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
  await api(page, (a) => a.startWave()); // locks the tower (milestone 25a): Sell pays 70%

  // (a) A greyed path changes nothing when neither path is affordable.
  await setGold(page, 0);
  await click(page, 'panel:path:A');
  s = await state(page);
  expect(s.gold).toBe(0);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, upgraded: true, spent: 85 })]);

  await click(page, 'panel:sell');
  s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(59);
  expect(await ui(page)).toMatchObject(NO_UI);

  // (c) The cell is empty again: without a pick a click selects nothing; with one it builds.
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject(NO_UI);
  await click(page, 'bar:musketeer');
  await clickCell(page, C75);
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer', upgraded: false })]);
});

test('(b) selling during an active wave removes the tower and the wave continues', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer');
  await clickCell(page, C75);
  await click(page, 'startWave');
  await step(page, 120);
  await clickCell(page, C75); // pick active: selects the tower and clears the pick
  expect(await ui(page)).toMatchObject({ pick: null, selectedCell: C75, panelOpen: true });
  await click(page, 'panel:sell');
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.phase).toBe('wave');
  await step(page, 60);
  const s2 = await state(page);
  expect(s2.phase).toBe('wave');
  expect(s2.tick).toBe(s.tick + 60);
});

test('clicking empty map or Escape deselects; another tower moves the selection', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().gold = 1000; // test setup
    t.buildAt(7, 5, 'musketeer');
    t.buildAt(7, 7, 'cannon');
  });
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
  await clickCell(page, { col: 28, row: 12 }); // empty grass
  expect(await ui(page)).toMatchObject(NO_UI);

  await clickCell(page, C75);
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject(NO_UI);

  // (7,7) sits under (7,5)'s panel (below it), so open (7,7) first, then move to (7,5).
  await clickCell(page, { col: 7, row: 7 });
  expect(await ui(page)).toMatchObject({ selectedCell: { col: 7, row: 7 }, panelOpen: true });
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
});

test('(d) Start Wave and speed work with a pick active (it stays) and close the panel', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer');
  await click(page, 'startWave');
  expect((await state(page)).phase).toBe('wave');
  expect((await ui(page)).pick).toBe('musketeer');

  await clickCell(page, C75);
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ panelOpen: true });
  await click(page, 'speed');
  expect(await ui(page)).toMatchObject({ panelOpen: false });
  expect(await api(page, (a) => a.speed())).toBe(2);
});

test('hover: the hovered cell and the cursor follow the pointer; the HUD has no hover cell', async ({ page }) => {
  await startGame(page);
  await page.mouse.move(464, 272); // (14,8): buildable
  expect((await ui(page)).hoverCell).toEqual({ col: 14, row: 8 });
  expect(await cursor(page)).not.toBe('pointer'); // no pick, no tower

  await click(page, 'bar:cannon');
  await page.mouse.move(464, 272);
  expect(await ui(page)).toMatchObject({ pick: 'cannon', hoverCell: { col: 14, row: 8 } });
  expect(await cursor(page)).toBe('pointer');

  await page.mouse.move(432, 272); // (13,8): on the path
  expect((await ui(page)).hoverCell).toEqual({ col: 13, row: 8 });
  expect(await cursor(page)).not.toBe('pointer');

  await page.mouse.move(600, 505); // HUD row 1, away from the buttons
  expect((await ui(page)).hoverCell).toBeNull();
});

// Edge cells: (0,5) left edge, (29,7) right edge ((29,5) is on the path's
// last run; of the two nearest buildable cells, (29,3) and (29,7), the one
// below the path; (29,4) is under the exit cottage), (7,0) top edge, (15,14)
// bottom row, right above the HUD.
const EDGE_CELLS: Cell[] = [
  { col: 0, row: 5 },
  { col: 29, row: 7 },
  { col: 7, row: 0 },
  { col: 15, row: 14 },
];

test('(f) no panel leaves the map or overlaps the HUD, for towers at the edges', async ({ page }) => {
  await startGame(page);
  await setGold(page, 9999);
  const cottage = await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(29, 4, 'musketeer'));
  expect(cottage).toEqual({ ok: false, reason: 'not-buildable' });
  for (const c of EDGE_CELLS) {
    const built = await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'musketeer'), [c.col, c.row]);
    expect(built.ok, `build at (${c.col},${c.row})`).toBe(true);
  }
  for (const c of EDGE_CELLS) {
    await clickCell(page, c);
    expect(await ui(page), `select (${c.col},${c.row})`).toMatchObject({ selectedCell: c, panelOpen: true });
    const r = await rects(page);
    for (const n of ['panel:upgrade', 'panel:sell']) {
      const where = `${n} for (${c.col},${c.row})`;
      expect(r[n], where).toBeTruthy();
      expect(r[n].x, where).toBeGreaterThanOrEqual(0);
      expect(r[n].y, where).toBeGreaterThanOrEqual(0);
      expect(r[n].x + r[n].width, where).toBeLessThanOrEqual(960);
      expect(r[n].y + r[n].height, where).toBeLessThanOrEqual(480);
    }
    await page.keyboard.press('Escape');
  }
});

test('(f) the ghost and its range never draw over the HUD', async ({ page }) => {
  await startGame(page);
  await click(page, 'bar:musketeer'); // the largest base range (110)
  const hud = { x: 0, y: 480, width: 960, height: 100 };
  // Reference: pointer on a path cell (red tint, no ghost).
  await page.mouse.move(80, 240);
  await settle(page);
  const before = await page.screenshot({ clip: hud });
  for (const c of EDGE_CELLS) {
    const p = centre(c);
    await page.mouse.move(p.x, p.y);
    await settle(page);
    expect(await ui(page), `hover (${c.col},${c.row})`).toMatchObject({ pick: 'musketeer', hoverCell: c });
    const after = await page.screenshot({ clip: hud });
    expect(after.equals(before), `HUD pixels with the ghost at (${c.col},${c.row})`).toBe(true);
  }
  // Control: the ghost does change the pixels just above the HUD.
  const above = { x: 0, y: 380, width: 960, height: 100 };
  await page.mouse.move(80, 240);
  await settle(page);
  const plain = await page.screenshot({ clip: above });
  await page.mouse.move(15 * 32 + 16, 14 * 32 + 16);
  await settle(page);
  expect((await page.screenshot({ clip: above })).equals(plain)).toBe(false);
});

test('the panel close button closes the panel on a mouse click too (milestone 14)', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true, isTouch: false, armedCell: null });
  const r = await rects(page);
  expect(r['panel:close']).toMatchObject({ width: 42, height: 42 });
  await click(page, 'panel:close');
  expect(await ui(page)).toMatchObject({ selectedCell: null, panelOpen: false });
});
