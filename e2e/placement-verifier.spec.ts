import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 9 verifier probes (Claude Sonnet), independent of build-ui.spec.ts.
// Real mouse clicks; cell (col,row) is clicked at (col*32+16, row*32+16).

type Cell = { col: number; row: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const setGold = (page: Page, g: number) =>
  page.evaluate((v) => {
    (window.__tarpit as TarpitTestApi).state().gold = v;
  }, g);
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
// Greyed state read from the live Button objects (hud.bar.buttons[i].isEnabled): [musketeer, cannon, tarpit].
const barEnabled = (page: Page) =>
  page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game') as unknown as {
      hud: { bar: { buttons: { isEnabled: boolean }[] } };
    };
    return scene.hud.bar.buttons.map((b) => b.isEnabled);
  });

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}
async function clickBar(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, name).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}
const clickCell = (page: Page, c: Cell) => page.mouse.click(c.col * 32 + 16, c.row * 32 + 16);
const buildable = (page: Page, c: Cell) =>
  page.evaluate(`(${((cc: Cell) => {
    // No sim import in the page: probe by asking the live scene's hook, then undo through state.
    const a = window.__tarpit as TarpitTestApi;
    const s = a.state();
    const gold = s.gold;
    s.gold = 1000;
    const r = a.buildAt(cc.col, cc.row, 'musketeer');
    if (r.ok) a.sellAt(cc.col, cc.row);
    s.gold = gold;
    return r.ok;
  }).toString()})(${JSON.stringify(c)})`) as Promise<boolean>;

test('(a) three placements keep the pick; the fourth empties gold, clears the pick and greys the button', async ({ page }) => {
  await startGame(page);
  await setGold(page, 200);
  await clickBar(page, 'bar:musketeer');
  const cells: Cell[] = [{ col: 2, row: 5 }, { col: 2, row: 9 }, { col: 7, row: 5 }];
  for (const c of cells) await clickCell(page, c);
  let s = await state(page);
  // Towers are kept in row-major cell-key order, not click order.
  expect(s.towers.map((t) => t.cell)).toEqual([...cells].sort((a, b) => a.row - b.row || a.col - b.col));
  expect(s.gold).toBe(50);
  expect((await ui(page)).pick).toBe('musketeer');
  await clickCell(page, { col: 10, row: 5 });
  s = await state(page);
  expect(s.towers.length).toBe(4);
  expect(s.gold).toBe(0);
  expect((await ui(page)).pick).toBeNull();
  await settle(page);
  expect((await barEnabled(page))[0]).toBe(false);
});

test('(a2) at 49 gold with a pick the pick clears and a cell click builds nothing', async ({ page }) => {
  await startGame(page);
  await setGold(page, 50);
  await clickBar(page, 'bar:musketeer');
  expect((await ui(page)).pick).toBe('musketeer');
  await setGold(page, 49);
  await settle(page);
  expect((await ui(page)).pick).toBeNull();
  expect((await barEnabled(page))[0]).toBe(false);
  await clickCell(page, { col: 2, row: 5 });
  const s = await state(page);
  expect(s.towers.length).toBe(0);
  expect(s.gold).toBe(49);
});

test('(b) Start Wave with a pick active: the wave starts, the pick stays, and placing works mid-wave', async ({ page }) => {
  await startGame(page);
  await clickBar(page, 'bar:musketeer');
  await clickBar(page, 'startWave');
  let s = await state(page);
  expect(s.phase).toBe('wave');
  expect((await ui(page)).pick).toBe('musketeer');
  await clickCell(page, { col: 2, row: 5 });
  s = await state(page);
  expect(s.towers.length).toBe(1);
  expect(s.gold).toBe(50);
  expect(s.phase).toBe('wave');
});

test('(c) Cannon is pickable at exactly 80 gold and not at 79', async ({ page }) => {
  await startGame(page);
  await setGold(page, 80);
  await settle(page);
  await clickBar(page, 'bar:cannon');
  expect((await ui(page)).pick).toBe('cannon');
  await clickBar(page, 'bar:cannon'); // clears
  expect((await ui(page)).pick).toBeNull();
  await setGold(page, 79);
  await settle(page);
  expect((await barEnabled(page))[1]).toBe(false);
  await clickBar(page, 'bar:cannon');
  expect((await ui(page)).pick).toBeNull();
});

test('(d) Escape closes the panel and clears selectedCell', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  await clickCell(page, { col: 7, row: 5 });
  expect(await ui(page)).toMatchObject({ selectedCell: { col: 7, row: 5 }, panelOpen: true });
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject({ selectedCell: null, panelOpen: false });
});

test('(e) a path cell with a pick: no tower, gold unchanged, hoverCell is that cell, sim says not buildable', async ({ page }) => {
  await startGame(page);
  await clickBar(page, 'bar:musketeer');
  const c = { col: 13, row: 8 }; // on the long vertical run at x 420
  const before = (await state(page)).gold;
  await clickCell(page, c);
  const s = await state(page);
  expect(s.towers.length).toBe(0);
  expect(s.gold).toBe(before);
  expect((await ui(page)).hoverCell).toEqual(c);
  expect(await buildable(page, c)).toBe(false);
  expect((await ui(page)).pick).toBe('musketeer');
  // control: the probe says a known-good cell is buildable
  expect(await buildable(page, { col: 2, row: 5 })).toBe(true);
});

test('(f) bottom-row hover leaves the HUD rects unchanged; the panel at the bottom-right cell stays above y 480', async ({ page }) => {
  await startGame(page);
  const before = await rects(page);
  await clickBar(page, 'bar:musketeer');
  const c = { col: 5, row: 14 };
  expect(await buildable(page, c)).toBe(true);
  await page.mouse.move(c.col * 32 + 16, c.row * 32 + 16);
  expect((await ui(page)).hoverCell).toEqual(c);
  expect((await ui(page)).hoverCell?.row).toBe(14);
  expect(await rects(page)).toEqual(before);

  // Panel for a tower at the bottom-right buildable cell.
  let br: Cell | null = null;
  for (let col = 29; col >= 0 && !br; col--) if (await buildable(page, { col, row: 14 })) br = { col, row: 14 };
  expect(br).toEqual({ col: 29, row: 14 });
  await page.keyboard.press('Escape');
  await setGold(page, 100);
  await api(page, (a) => a.buildAt(29, 14, 'musketeer'));
  await clickCell(page, br as Cell);
  expect((await ui(page)).panelOpen).toBe(true);
  const r = await rects(page);
  for (const k of ['panel:upgrade', 'panel:sell']) {
    expect(r[k], k).toBeTruthy();
    expect(r[k].x).toBeGreaterThanOrEqual(0);
    expect(r[k].x + r[k].width).toBeLessThanOrEqual(960);
    expect(r[k].y).toBeGreaterThanOrEqual(0);
    expect(r[k].y + r[k].height).toBeLessThan(480);
  }
});
