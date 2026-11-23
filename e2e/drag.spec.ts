import { expect, test, type Page } from '@playwright/test';
import { PANEL_TEXT } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 25a, desktop project (mouse): drag to place from the build bar,
// move an unlocked tower by drag, Remove for a full refund, Undo upgrade,
// then after Start Wave the tower is locked, cannot be dragged and sells for
// 70%. At the 960x580 viewport canvas space is page space. Time is frozen
// (?test=1), so gold changes only through the actions.

type Cell = { col: number; row: number };
const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };
const PATH: Cell = { col: 3, row: 7 }; // on the first path run (y 240)

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const centre = (c: Cell) => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function rectCentre(page: Page, name: string): Promise<{ x: number; y: number }> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function click(page: Page, name: string): Promise<void> {
  const p = await rectCentre(page, name);
  await page.mouse.click(p.x, p.y);
}

/** Press at `from`, move in steps to `to`, run `during` while still held, release. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, during?: () => Promise<void>): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  if (during) await during();
  await page.mouse.up();
}

const remove = (gold: number) => `${PANEL_TEXT.remove}  +${gold}`;
const sell = (gold: number) => `${PANEL_TEXT.sell}  +${gold}`;
const undo = (gold: number) => `${PANEL_TEXT.undoUpgrade}  +${gold}`;

test('drag to place, move, remove, undo upgrade, then locked after Start Wave', async ({ page }) => {
  await startGame(page);

  // Drag a Musketeer from the bar onto (7,5).
  await drag(page, await rectCentre(page, 'bar:musketeer'), centre(C75), async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: C75 });
  });
  let s = await state(page);
  expect(s.gold).toBe(50);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer', locked: false, unlockedSpend: 50 })]);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', dragging: null });

  // Drag the tower from (7,5) to (9,5): moved for free.
  await drag(page, centre(C75), centre(C95), async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: C95 });
  });
  s = await state(page);
  expect(s.gold).toBe(50);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C95, locked: false })]);
  expect(await ui(page)).toMatchObject({ dragging: null, panelOpen: false });

  // Select it: the Sell slot is Remove with the full +50; it refunds everything.
  await page.mouse.click(centre(C95).x, centre(C95).y);
  expect(await ui(page)).toMatchObject({ selectedCell: C95, panelOpen: true, sellLabel: remove(50) });
  await click(page, 'panel:sell');
  s = await state(page);
  expect(s.gold).toBe(100);
  expect(s.towers).toEqual([]);

  // Rebuild at (7,5) by drag, upgrade through the panel, then undo the upgrade.
  await drag(page, await rectCentre(page, 'bar:musketeer'), centre(C75));
  await page.mouse.click(centre(C75).x, centre(C75).y);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true });
  await click(page, 'panel:upgrade');
  s = await state(page);
  expect(s.gold).toBe(15);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, upgraded: true, upgradedThisPhase: true })]);
  expect(await ui(page)).toMatchObject({ upgradeLabel: undo(35), sellLabel: remove(85) });
  await click(page, 'panel:undo');
  s = await state(page);
  expect(s.gold).toBe(50);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, upgraded: false, upgradedThisPhase: false, locked: false })]);
  expect(await ui(page)).toMatchObject({ panelOpen: true, sellLabel: remove(50) });

  // Start wave 1: locked, so no dashed outline and no drag; Sell pays 70%.
  await click(page, 'startWave');
  s = await state(page);
  expect(s.phase).toBe('wave');
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, locked: true, unlockedSpend: 0 })]);
  await drag(page, centre(C75), centre(C95), async () => {
    expect((await ui(page)).dragging).toBeNull();
  });
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75 })]);
  await page.mouse.click(centre(C75).x, centre(C75).y);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true, sellLabel: sell(35) });
  await click(page, 'panel:sell');
  s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(85);
});

test('a bar drag released over the HUD or on the path builds nothing; the pick stays', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:musketeer');

  // Over the map, then back down to the HUD's stats row, and release.
  await drag(page, bar, centre(C75), async () => {
    await page.mouse.move(480, 505, { steps: 5 });
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: null });
  });
  let s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', dragging: null });

  // Released on a path cell: red, nothing built.
  await drag(page, bar, centre(PATH), async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: PATH });
  });
  s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
});

test('a press and release on a bar button without leaving it is a click: it toggles the pick', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:cannon');
  await drag(page, bar, { x: bar.x + 5, y: bar.y + 3 }, async () => {
    expect((await ui(page)).dragging).toBeNull(); // under the 8 px threshold
  });
  expect((await ui(page)).pick).toBe('cannon');
  await click(page, 'bar:cannon');
  expect((await ui(page)).pick).toBeNull();
});

test('a drag that ends back on its bar button cancels and keeps the pick', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:cannon');
  await drag(page, bar, { x: bar.x + 40, y: bar.y }, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'cannon', cell: null });
  });
  expect(await ui(page)).toMatchObject({ pick: 'cannon', dragging: null });
  expect((await state(page)).towers).toEqual([]);
});

test('drag to place mid-wave builds a locked tower', async ({ page }) => {
  await startGame(page);
  await click(page, 'startWave');
  await drag(page, await rectCentre(page, 'bar:musketeer'), centre(C75));
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, locked: true, unlockedSpend: 0 })]);
  expect(s.gold).toBe(50);
});

// Coordinator follow-up: a mouseup the page never sees (released outside the
// window) must not leave a drag stuck to the pointer. CDP sends a press and
// moves with the button held, then a move with buttons 0 and no release.
test('a mouse drag whose button was released unseen cancels on the next move', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  const bar = await rectCentre(page, 'bar:musketeer');
  const mouse = (type: 'mousePressed' | 'mouseMoved', x: number, y: number, buttons: number, button: 'none' | 'left' = 'none') =>
    client.send('Input.dispatchMouseEvent', { type, x, y, buttons, button, clickCount: type === 'mousePressed' ? 1 : 0 });
  await mouse('mouseMoved', bar.x, bar.y, 0);
  await mouse('mousePressed', bar.x, bar.y, 1, 'left');
  for (let i = 1; i <= 8; i++) await mouse('mouseMoved', bar.x + ((240 - bar.x) * i) / 8, bar.y + ((176 - bar.y) * i) / 8, 1, 'left');
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: C75 });
  // The button comes up somewhere the page cannot see; the next move reports no button.
  await mouse('mouseMoved', 304, 176, 0);
  expect((await ui(page)).dragging).toBeNull();
  // Nothing was built, and later moves and clicks behave normally (the pick stays).
  await mouse('mouseMoved', 272, 176, 0);
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', dragging: null, hoverCell: { col: 8, row: 5 } });
});
