import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 11: Longbow, Mortar and Fire Pot on the build bar, through real
// mouse clicks (bar buttons at uiRects(), cell (col,row) at its centre
// (col * 32 + 16, row * 32 + 16)). Time is frozen (?test=1) and driven by
// step(). Costs and refunds from docs/DESIGN.md: Longbow 40 + 30 sells for
// 49, Mortar 110 + 80 for 133, Fire Pot 70 + 50 for 84.

type Cell = { col: number; row: number };
type NewTower = 'longbow' | 'mortar' | 'firepot';

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const setGold = (page: Page, gold: number) =>
  page.evaluate((g) => {
    (window.__tarpit as TarpitTestApi).state().gold = g; // test setup through the live object
  }, gold);
/** Wait two animation frames so update() has redrawn (it greys the bar from the live gold). */
const settle = (page: Page) =>
  page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

/** Click the centre of a named rectangle from uiRects(); fails if it is not there. */
async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}
const clickCell = (page: Page, c: Cell) => page.mouse.click(c.col * 32 + 16, c.row * 32 + 16);

// Known buildable cells (the combo build's cells, docs/DESIGN.md grid rule).
const CASES: { type: NewTower; cell: Cell; cost: number; upgrade: number; refund: number }[] = [
  { type: 'longbow', cell: { col: 6, row: 5 }, cost: 40, upgrade: 30, refund: 49 },
  { type: 'mortar', cell: { col: 17, row: 6 }, cost: 110, upgrade: 80, refund: 133 },
  { type: 'firepot', cell: { col: 14, row: 8 }, cost: 70, upgrade: 50, refund: 84 },
];

test('the bar has six buttons, 148 px wide and 8 px apart from x 16', async ({ page }) => {
  await startGame(page);
  const r = await rects(page);
  const order = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
  expect(Object.keys(r).filter((k) => k.startsWith('bar:'))).toEqual(order.map((t) => `bar:${t}`));
  order.forEach((t, i) => expect(r[`bar:${t}`]).toEqual({ x: 16 + i * 156, y: 533, width: 148, height: 42 }));
});

for (const c of CASES) {
  test(`pick ${c.type} on the bar, place it with a click, upgrade and sell it through the panel`, async ({ page }) => {
    await startGame(page);
    await setGold(page, 1000);
    await click(page, `bar:${c.type}`);
    expect(await ui(page)).toMatchObject({ pick: c.type, panelOpen: false });
    await clickCell(page, c.cell);
    let s = await state(page);
    expect(s.towers).toEqual([expect.objectContaining({ cell: c.cell, type: c.type, upgraded: false })]);
    expect(s.gold).toBe(1000 - c.cost);

    // Clicking the tower selects it (and clears the pick); upgrade, then sell.
    await clickCell(page, c.cell);
    expect(await ui(page)).toMatchObject({ pick: null, selectedCell: c.cell, panelOpen: true });
    await click(page, 'panel:upgrade');
    s = await state(page);
    expect(s.towers).toEqual([expect.objectContaining({ cell: c.cell, type: c.type, upgraded: true, spent: c.cost + c.upgrade })]);
    expect(s.gold).toBe(1000 - c.cost - c.upgrade);
    await api(page, (a) => a.startWave()); // locks the tower (milestone 25a): Sell pays 70%
    await click(page, 'panel:sell');
    s = await state(page);
    expect(s.towers).toEqual([]);
    expect(s.gold).toBe(1000 - c.cost - c.upgrade + c.refund);
    expect(await ui(page)).toMatchObject({ pick: null, selectedCell: null, panelOpen: false });
  });
}

test('Mortar is not pickable at 109 gold and pickable at 110', async ({ page }) => {
  await startGame(page);
  await setGold(page, 109);
  await settle(page);
  await click(page, 'bar:mortar');
  expect((await ui(page)).pick).toBeNull();
  await clickCell(page, { col: 17, row: 6 });
  expect((await state(page)).towers).toEqual([]);

  await setGold(page, 110);
  await settle(page);
  await click(page, 'bar:mortar');
  expect((await ui(page)).pick).toBe('mortar');
  await clickCell(page, { col: 17, row: 6 });
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: { col: 17, row: 6 }, type: 'mortar' })]);
  expect(s.gold).toBe(0);
  // At 0 gold the pick clears.
  expect((await ui(page)).pick).toBeNull();
});

// A Tar Pit at (14,6) and a Fire Pot at (14,8) cover the same stretch of the
// long downhill run (x = 420), as in the combo build. In wave 1 the first
// enemy that is slowed and burning at once is Goblin 0 at tick 687 (headless
// scan: slowTicksLeft 92, burnTicksLeft 180); the loop below finds it with a
// cap rather than hard-coding the tick. Milestone 25c first pass (12 hp
// Goblins): Goblin 2 at tick 837; second pass (19 hp Goblins): Goblin 0 at
// tick 687 again, slowTicksLeft 92, burnTicksLeft 180 (headless scan).
const FIRST_SLOWED_AND_BURNING_TICK = 687;

test('a Tar Pit and a Fire Pot together leave an enemy slowed and burning', async ({ page }) => {
  await startGame(page);
  await setGold(page, 1000);
  await click(page, 'bar:tarpit');
  await clickCell(page, { col: 14, row: 6 });
  await click(page, 'bar:firepot');
  await clickCell(page, { col: 14, row: 8 });
  await page.keyboard.press('Escape');
  expect((await state(page)).towers.map((t) => t.type)).toEqual(['tarpit', 'firepot']);
  await click(page, 'startWave');

  const found = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    for (let i = 1; i <= 3000; i++) {
      t.step(1);
      const e = t.state().enemies.find((x) => x.slowTicksLeft > 0 && (x.burnTicksLeft ?? 0) > 0);
      if (e) return { tick: i, id: e.id, slow: e.slowTicksLeft, burn: e.burnTicksLeft };
    }
    return null;
  });
  expect(found).toEqual({ tick: FIRST_SLOWED_AND_BURNING_TICK, id: 0, slow: 92, burn: 180 });
});
