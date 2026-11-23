import { expect, test, type Page } from '@playwright/test';
import { PANEL_TEXT } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { TOWER_DEFS } from '../src/sim/towers';
import type { TowerType } from '../src/sim/types';

// Verifier probes for milestone 25a, desktop project (real mouse). Written
// from docs/SCOPE-v4.md and docs/DESIGN.md "Planning phase". At the 960x580
// viewport canvas space is page space; one test widens the viewport so there
// is page outside the canvas to release on.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };
const TYPES = Object.keys(TOWER_DEFS) as TowerType[];

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const setGold = (page: Page, gold: number) => page.evaluate((g) => void ((window.__tarpit as TarpitTestApi).state().gold = g), gold);

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function clickRect(page: Page, name: string): Promise<void> {
  const p = await rectCentre(page, name);
  await page.mouse.click(p.x, p.y);
}

const clickCell = (page: Page, c: Cell) => page.mouse.click(centre(c).x, centre(c).y);

test('(a) 5 px of travel on a bar button is a click; 12 px is a drag', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:musketeer');
  const left = { x: bar.x - 6, y: bar.y };

  // 5 px: a click, the pick toggles on, then off.
  for (const want of ['musketeer', null]) {
    await page.mouse.move(left.x, left.y);
    await page.mouse.down();
    await page.mouse.move(left.x + 5, left.y, { steps: 5 });
    expect((await ui(page)).dragging).toBeNull();
    await page.mouse.up();
    expect((await ui(page)).pick).toBe(want);
  }
  // Exactly 8 px is still not a drag; 12 px is, even while still on the button.
  await page.mouse.move(left.x, left.y);
  await page.mouse.down();
  await page.mouse.move(left.x + 8, left.y, { steps: 4 });
  expect((await ui(page)).dragging).toBeNull();
  await page.mouse.move(left.x + 12, left.y, { steps: 2 });
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: null });
  await page.mouse.up();
  // The release of a drag is not a click: the pick it set stays, nothing is built.
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', dragging: null });
  expect((await state(page)).towers).toEqual([]);
  expect((await state(page)).gold).toBe(100);
});

test('(b) mouse drag: the ghost cell is the cell under the pointer, with no lift', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:musketeer');
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  const probes: [Point, Cell][] = [
    [{ x: 7 * 32 + 1, y: 5 * 32 + 1 }, C75],
    [{ x: 7 * 32 + 31, y: 5 * 32 + 31 }, C75],
    [{ x: 8 * 32, y: 6 * 32 }, { col: 8, row: 6 }],
    [{ x: 240, y: 479 }, { col: 7, row: 14 }], // the bottom row is reachable with the mouse
    [{ x: 240, y: 1 }, { col: 7, row: 0 }],
  ];
  for (const [p, cell] of probes) {
    await page.mouse.move(p.x, p.y, { steps: 4 });
    const u = await ui(page);
    expect(u.dragging, JSON.stringify(p)).toEqual({ kind: 'place', tower: 'musketeer', cell });
    expect(u.hoverCell).toEqual(cell);
  }
  await page.mouse.move(240, 481, { steps: 2 }); // the HUD starts at y 480
  expect((await ui(page)).dragging).toMatchObject({ cell: null });
  await page.mouse.move(7 * 32 + 31, 5 * 32 + 1, { steps: 4 });
  await page.mouse.up();
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75, locked: false })]);
});

test('(d) dragging an unlocked tower onto another tower moves nothing', async ({ page }) => {
  await startGame(page);
  await setGold(page, 300);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  await api(page, (a) => a.buildAt(9, 5, 'cannon'));
  await api(page, (a) => a.upgradeAt(9, 5));
  const before = await state(page);
  await page.mouse.move(centre(C75).x, centre(C75).y);
  await page.mouse.down();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 8 });
  expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: C95 });
  await page.mouse.up();
  const after = await state(page);
  expect(after.towers).toEqual(before.towers);
  expect(after.gold).toBe(before.gold);
  expect(after.gold).toBe(300 - 50 - 80 - 60);
  expect((await ui(page)).dragging).toBeNull();
  // Onto the path and onto the cottage: the same.
  for (const to of [{ col: 3, row: 7 }, { col: 28, row: 4 }]) {
    await page.mouse.move(centre(C75).x, centre(C75).y);
    await page.mouse.down();
    await page.mouse.move(centre(to).x, centre(to).y, { steps: 8 });
    await page.mouse.up();
    expect((await state(page)).towers).toEqual(before.towers);
  }
});

test('(e) a tower drag released outside the canvas cancels; nothing sticks and the next click works', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 }); // the canvas fits at 1100 x 664.6, leaving a band below
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  const from = await toPage(page, centre(C75));
  const over = await toPage(page, centre(C95));
  const canvas = await page.locator('canvas').boundingBox();
  expect(canvas!.y + canvas!.height).toBeLessThan(690);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(over.x, over.y, { steps: 8 });
  expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: C95 });
  await page.mouse.move(550, 692, { steps: 8 });
  await page.mouse.up();
  let u = await ui(page);
  expect(u.dragging).toBeNull();
  let s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, locked: false })]);
  expect(s.gold).toBe(50);
  // Back inside with the button up: no drag, the tower does not follow.
  await page.mouse.move(over.x, over.y, { steps: 8 });
  u = await ui(page);
  expect(u.dragging).toBeNull();
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75 })]);
  // The next click works: it selects the tower.
  await page.mouse.click(from.x, from.y);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true, sellLabel: `${PANEL_TEXT.remove}  +50` });

  // The same for a bar drag: released below the canvas builds nothing.
  await page.keyboard.press('Escape');
  const bar = await toPage(page, await rectCentre(page, 'bar:longbow'));
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(over.x, over.y, { steps: 8 });
  await page.mouse.move(550, 692, { steps: 8 });
  await page.mouse.up();
  s = await state(page);
  expect(s.towers).toHaveLength(1);
  expect(s.gold).toBe(50);
  expect((await ui(page)).dragging).toBeNull();
});

test('(f) the pointer leaves the window mid-drag and the button is released out there: no stuck drag', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  await page.mouse.move(centre(C75).x, centre(C75).y);
  await page.mouse.down();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 8 });
  expect((await ui(page)).dragging).not.toBeNull();
  await page.mouse.move(-40, 200, { steps: 6 }); // off the left edge of the window
  await page.mouse.up();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 6 });
  const u = await ui(page);
  expect(u.dragging).toBeNull();
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, locked: false })]);
  expect(s.gold).toBe(50);
  // A plain click on the empty cell does nothing (no pick), and the tower still drags.
  await clickCell(page, C95);
  expect((await state(page)).towers).toHaveLength(1);
  await page.mouse.move(centre(C75).x, centre(C75).y);
  await page.mouse.down();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 8 });
  await page.mouse.up();
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C95 })]);
});

test('(g) gold runs short mid-drag: the release builds nothing and gold never goes negative', async ({ page }) => {
  await startGame(page);
  const bar = await rectCentre(page, 'bar:cannon');
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(centre(C75).x, centre(C75).y, { steps: 8 });
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'cannon', cell: C75 });
  await setGold(page, 79); // one short of a Cannon, through the live state
  await page.mouse.up();
  let s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(79);
  expect(await ui(page)).toMatchObject({ dragging: null, pick: null }); // the pick it can no longer afford is dropped

  // And when the redraw sees the shortage before the release, the drag itself ends.
  await setGold(page, 80);
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(centre(C75).x, centre(C75).y, { steps: 8 });
  await setGold(page, 0);
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 4 });
  await page.mouse.up();
  s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(0);
  expect((await ui(page)).dragging).toBeNull();
  // A bar button the player cannot afford does not start a drag at all.
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(centre(C75).x, centre(C75).y, { steps: 8 });
  expect((await ui(page)).dragging).toBeNull();
  await page.mouse.up();
  expect((await state(page)).towers).toEqual([]);
});

test('(h) click placement still works: pick, click a cell, click another', async ({ page }) => {
  await startGame(page);
  await clickRect(page, 'bar:longbow');
  expect((await ui(page)).pick).toBe('longbow');
  await clickCell(page, C75);
  await clickCell(page, C95);
  const s = await state(page);
  expect(s.towers).toEqual([
    expect.objectContaining({ cell: C75, type: 'longbow', locked: false, unlockedSpend: 40 }),
    expect.objectContaining({ cell: C95, type: 'longbow', locked: false, unlockedSpend: 40 }),
  ]);
  expect(s.gold).toBe(20);
  expect((await ui(page)).dragging).toBeNull();
});

test('(i) during a wave a bar drag builds a locked tower and towers do not drag', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'longbow'));
  await clickRect(page, 'startWave');
  const bar = await rectCentre(page, 'bar:longbow');
  await page.mouse.move(bar.x, bar.y);
  await page.mouse.down();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 8 });
  await page.mouse.up();
  let s = await state(page);
  expect(s.phase).toBe('wave');
  expect(s.gold).toBe(20);
  expect(s.towers).toEqual([
    expect.objectContaining({ cell: C75, locked: true, unlockedSpend: 0 }),
    expect.objectContaining({ cell: C95, type: 'longbow', locked: true, unlockedSpend: 0 }),
  ]);
  for (const from of [C75, C95]) {
    await page.mouse.move(centre(from).x, centre(from).y);
    await page.mouse.down();
    await page.mouse.move(centre({ col: 11, row: 5 }).x, centre({ col: 11, row: 5 }).y, { steps: 8 });
    expect((await ui(page)).dragging).toBeNull();
    await page.mouse.up();
  }
  s = await state(page);
  expect(s.towers.map((t) => t.cell)).toEqual([C75, C95]);
  // The press without a drag effect still selected the tower: Sell at 70%.
  expect(await ui(page)).toMatchObject({ selectedCell: C95, sellLabel: `${PANEL_TEXT.sell}  +28` });
});

/** The two visible Text objects of a two-label panel button whose left label reads `left`. */
async function labelBounds(page: Page, left: string, right: string) {
  return page.evaluate(
    ([l, r]) => {
      const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
      const texts = scene.children.list.filter((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).visible) as Phaser.GameObjects.Text[];
      const bounds = (t: Phaser.GameObjects.Text) => {
        const b = t.getBounds();
        return { x: b.x, y: b.y, width: b.width, height: b.height, fontSize: String(t.style.fontSize) };
      };
      const lefts = texts.filter((t) => t.text === l).map(bounds);
      const rights = texts.filter((t) => t.text === r).map(bounds);
      return { lefts, rights };
    },
    [left, right],
  );
}

async function expectFits(page: Page, slot: 'panel:undo' | 'panel:sell', left: string, right: string): Promise<void> {
  const button = (await rects(page))[slot];
  const { lefts, rights } = await labelBounds(page, left, right);
  const inRow = (t: { y: number; height: number }) => t.y >= button.y && t.y + t.height <= button.y + button.height;
  const l = lefts.filter(inRow);
  const r = rights.filter(inRow);
  const what = `${left} ${right}`;
  expect(l, what).toHaveLength(1);
  expect(r, what).toHaveLength(1);
  // Inner width: the button less a 2 px edge and 4 px of air a side; and the two labels do not touch.
  expect(l[0].width + r[0].width, what).toBeLessThan(button.width - 12);
  expect(l[0].x, what).toBeGreaterThanOrEqual(button.x + 6);
  expect(r[0].x + r[0].width, what).toBeLessThanOrEqual(button.x + button.width - 6);
  expect(r[0].x - (l[0].x + l[0].width), what).toBeGreaterThanOrEqual(6);
}

for (const type of TYPES) {
  test(`panel, ${type}: Remove shows everything spent, Undo the upgrade cost, then Sell at 70% after Start Wave`, async ({ page }) => {
    const { cost, upgradeCost } = TOWER_DEFS[type];
    await startGame(page);
    await setGold(page, 1000);
    await page.evaluate((t) => (window.__tarpit as TarpitTestApi).buildAt(7, 5, t), type);
    await clickCell(page, C75);
    expect(await ui(page)).toMatchObject({ panelOpen: true, upgradeLabel: `${PANEL_TEXT.upgrade}  ${upgradeCost}`, sellLabel: `${PANEL_TEXT.remove}  +${cost}` });
    await expectFits(page, 'panel:sell', PANEL_TEXT.remove, `+${cost}`);

    await clickRect(page, 'panel:upgrade');
    expect((await state(page)).gold).toBe(1000 - cost - upgradeCost);
    expect(await ui(page)).toMatchObject({
      upgradeLabel: `${PANEL_TEXT.undoUpgrade}  +${upgradeCost}`,
      sellLabel: `${PANEL_TEXT.remove}  +${cost + upgradeCost}`,
    });
    await expectFits(page, 'panel:undo', PANEL_TEXT.undoUpgrade, `+${upgradeCost}`);
    await expectFits(page, 'panel:sell', PANEL_TEXT.remove, `+${cost + upgradeCost}`);

    // Undo pays the upgrade back in full; upgrade again; Start Wave locks it.
    await clickRect(page, 'panel:undo');
    expect((await state(page)).gold).toBe(1000 - cost);
    expect(await ui(page)).toMatchObject({ upgradeLabel: `${PANEL_TEXT.upgrade}  ${upgradeCost}`, sellLabel: `${PANEL_TEXT.remove}  +${cost}` });
    await clickRect(page, 'panel:upgrade');
    await clickRect(page, 'startWave'); // closes the panel
    await clickCell(page, C75);
    const refund = Math.floor(((cost + upgradeCost) * 7) / 10);
    expect(await ui(page)).toMatchObject({ panelOpen: true, upgradeLabel: null, sellLabel: `${PANEL_TEXT.sell}  +${refund}` });
    await expectFits(page, 'panel:sell', PANEL_TEXT.sell, `+${refund}`);
    await clickRect(page, 'panel:sell');
    const s = await state(page);
    expect(s.towers).toEqual([]);
    expect(s.gold).toBe(1000 - cost - upgradeCost + refund);
  });
}

test('panel: a locked tower upgraded in the next setup shows Undo upgrade +35 beside Sell +70', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  const phase = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.startWave();
    for (let i = 0; i < 100 && t.state().phase === 'wave'; i++) t.step(60);
    return t.state().phase;
  });
  expect(phase).toBe('setup');
  await setGold(page, 100);
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ upgradeLabel: `${PANEL_TEXT.upgrade}  35`, sellLabel: `${PANEL_TEXT.sell}  +35` });
  await clickRect(page, 'panel:upgrade');
  expect((await state(page)).gold).toBe(65);
  // Sell here pays 35 + 35 = 70 (coordinator follow-up), the same as Undo then Sell.
  expect(await ui(page)).toMatchObject({ upgradeLabel: `${PANEL_TEXT.undoUpgrade}  +35`, sellLabel: `${PANEL_TEXT.sell}  +70` });
  await clickRect(page, 'panel:undo');
  expect((await state(page)).gold).toBe(100);
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75, locked: true, upgraded: false, spent: 50 })]);
  // A locked tower does not drag in setup.
  await page.keyboard.press('Escape');
  await page.mouse.move(centre(C75).x, centre(C75).y);
  await page.mouse.down();
  await page.mouse.move(centre(C95).x, centre(C95).y, { steps: 8 });
  expect((await ui(page)).dragging).toBeNull();
  await page.mouse.up();
  expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: C75 })]);
});
