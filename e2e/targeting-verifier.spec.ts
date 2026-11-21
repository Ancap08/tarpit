import { expect, test, type Page } from '@playwright/test';
import { targetingButtonText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { buildableCells, cellFromKey } from '../src/sim/grid';

// Verifier probes for milestone 24: the tower panel's third button. Test
// mode, real mouse clicks at the rectangles uiRects() reports (canvas space
// is page space at the 960x580 viewport).

type Cell = { col: number; row: number };
type Rect = { x: number; y: number; width: number; height: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const build = (page: Page, c: Cell) => page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'longbow').ok, [c.col, c.row]);
const clickCell = (page: Page, c: Cell) => page.mouse.click(c.col * 32 + 16, c.row * 32 + 16);

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().gold = 1000;
  });
}

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

// The four extreme buildable cells, from the simulation's own table: the
// top row's left-most and right-most, the bottom row's left-most and right-most.
const CELLS: Cell[] = [];
buildableCells().forEach((ok, key) => {
  if (ok) CELLS.push(cellFromKey(key));
});
const rowsOf = CELLS.map((c) => c.row);
const inRow = (row: number) => CELLS.filter((c) => c.row === row).map((c) => c.col);
const TOP = Math.min(...rowsOf);
const BOTTOM = Math.max(...rowsOf);
const EXTREMES: Cell[] = [
  { col: Math.min(...inRow(TOP)), row: TOP },
  { col: Math.max(...inRow(TOP)), row: TOP },
  { col: Math.min(...inRow(BOTTOM)), row: BOTTOM },
  { col: Math.max(...inRow(BOTTOM)), row: BOTTOM },
];

test('the extreme buildable cells are the four map corners', () => {
  expect(EXTREMES).toEqual([
    { col: 0, row: 0 },
    { col: 29, row: 0 },
    { col: 0, row: 14 },
    { col: 29, row: 14 },
  ]);
});

for (const cell of EXTREMES) {
  test(`(a) tower at (${cell.col},${cell.row}): four buttons apart, 42 tall or more, 214 x 146 panel inside the map`, async ({ page }) => {
    await startGame(page);
    expect(await build(page, cell)).toBe(true);
    await clickCell(page, cell);
    expect(await ui(page)).toMatchObject({ selectedCell: cell, panelOpen: true, targetLabel: targetingButtonText('first') });
    const r = await rects(page);
    const names = ['panel:upgrade', 'panel:sell', 'panel:target', 'panel:close'];
    for (const n of names) {
      expect(r[n], n).toBeTruthy();
      expect(r[n].height, n).toBeGreaterThanOrEqual(42);
      expect(r[n].width, n).toBeGreaterThanOrEqual(42);
    }
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) expect(overlaps(r[names[i]], r[names[j]]), `${names[i]} over ${names[j]}`).toBe(false);
    }
    // Stacked top to bottom with a 4 px gap, same left edge.
    expect(r['panel:sell'].y - (r['panel:upgrade'].y + r['panel:upgrade'].height)).toBe(4);
    expect(r['panel:target'].y - (r['panel:sell'].y + r['panel:sell'].height)).toBe(4);
    expect(new Set([r['panel:upgrade'].x, r['panel:sell'].x, r['panel:target'].x]).size).toBe(1);
    // The whole panel: 6 px padding around the buttons.
    const panel = { x: r['panel:upgrade'].x - 6, y: r['panel:upgrade'].y - 6, width: 214, height: 146 };
    expect(r['panel:close'].x + r['panel:close'].width + 6).toBe(panel.x + panel.width);
    expect(r['panel:target'].y + r['panel:target'].height + 6).toBe(panel.y + panel.height);
    expect(panel.x).toBeGreaterThanOrEqual(0);
    expect(panel.y).toBeGreaterThanOrEqual(0);
    expect(panel.x + panel.width).toBeLessThanOrEqual(960);
    expect(panel.y + panel.height).toBeLessThanOrEqual(480); // the HUD starts at y 480
    // Not over its own tower.
    expect(overlaps(panel, { x: cell.col * 32, y: cell.row * 32, width: 32, height: 32 })).toBe(false);
    // And the targeting button answers a real click there.
    await click(page, 'panel:target');
    expect(await ui(page)).toMatchObject({ selectedTargeting: 'last', panelOpen: true });
  });
}

test('(b) three clicks: last, strongest, first, with three targeting events', async ({ page }) => {
  await startGame(page);
  const cell = { col: 7, row: 5 };
  expect(await build(page, cell)).toBe(true);
  await clickCell(page, cell);
  const before = (await api(page, (a) => a.events())).filter((e) => e.kind === 'targeting').length;
  expect(before).toBe(0);
  const seen: string[] = [];
  for (const mode of ['last', 'strongest', 'first'] as const) {
    await click(page, 'panel:target');
    expect(await ui(page)).toMatchObject({ selectedTargeting: mode, targetLabel: targetingButtonText(mode) });
    seen.push(mode);
  }
  expect(seen).toEqual(['last', 'strongest', 'first']);
  expect((await api(page, (a) => a.events())).filter((e) => e.kind === 'targeting')).toEqual([
    { kind: 'targeting', cell, mode: 'last' },
    { kind: 'targeting', cell, mode: 'strongest' },
    { kind: 'targeting', cell, mode: 'first' },
  ]);
  expect(await api(page, (a) => a.state().towers[0].targeting)).toBe('first');
  expect(await api(page, (a) => a.state().gold)).toBe(960); // 1000 - 40: the cycle is free
});

test('(d) each label fits inside the 156 px button', async ({ page }) => {
  await startGame(page);
  const cell = { col: 7, row: 5 };
  expect(await build(page, cell)).toBe(true);
  await clickCell(page, cell);
  for (const mode of ['first', 'last', 'strongest'] as const) {
    const want = targetingButtonText(mode);
    expect((await ui(page)).targetLabel).toBe(want);
    const button = (await rects(page))['panel:target'];
    const text = await page.evaluate((label) => {
      const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game');
      const found = scene.children.list.filter((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text === label && (o as Phaser.GameObjects.Text).visible) as Phaser.GameObjects.Text[];
      return found.map((t) => {
        const b = t.getBounds();
        return { x: b.x, y: b.y, width: b.width, height: b.height, fontSize: String(t.style.fontSize) };
      });
    }, want);
    expect(text, want).toHaveLength(1);
    const t = text[0];
    expect(t.fontSize).toBe('13px');
    // Inner width: the button less a 2 px edge and 4 px of air a side.
    expect(t.width, want).toBeLessThan(button.width - 12);
    expect(t.x, want).toBeGreaterThanOrEqual(button.x + 6);
    expect(t.x + t.width, want).toBeLessThanOrEqual(button.x + button.width - 6);
    expect(t.y, want).toBeGreaterThanOrEqual(button.y);
    expect(t.y + t.height, want).toBeLessThanOrEqual(button.y + button.height);
    // Centred.
    expect(Math.abs(t.x + t.width / 2 - (button.x + button.width / 2))).toBeLessThanOrEqual(1);
    await click(page, 'panel:target');
  }
});

test('(e) the mode survives closing and reopening the panel and selecting another tower', async ({ page }) => {
  await startGame(page);
  const a = { col: 7, row: 5 };
  const b = { col: 24, row: 9 };
  expect(await build(page, a)).toBe(true);
  expect(await build(page, b)).toBe(true);
  await clickCell(page, a);
  await click(page, 'panel:target');
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedCell: a, selectedTargeting: 'strongest' });
  // Close with the × and reopen.
  await click(page, 'panel:close');
  expect(await ui(page)).toMatchObject({ panelOpen: false, selectedTargeting: null, targetLabel: null });
  await clickCell(page, a);
  expect(await ui(page)).toMatchObject({ selectedCell: a, selectedTargeting: 'strongest', targetLabel: targetingButtonText('strongest') });
  // Close with Escape and reopen.
  await page.keyboard.press('Escape');
  expect(await ui(page)).toMatchObject({ panelOpen: false });
  await clickCell(page, a);
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'strongest' });
  // Select the other tower: it shows its own mode (First); one click there.
  await clickCell(page, b);
  expect(await ui(page)).toMatchObject({ selectedCell: b, selectedTargeting: 'first', targetLabel: targetingButtonText('first') });
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedCell: b, selectedTargeting: 'last' });
  // Back to the first: still Strongest, and the next click continues from it (to First).
  await clickCell(page, a);
  expect(await ui(page)).toMatchObject({ selectedCell: a, selectedTargeting: 'strongest', targetLabel: targetingButtonText('strongest') });
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedCell: a, selectedTargeting: 'first' });
  expect(await api(page, (t) => t.state().towers.map((x) => [x.cell.col, x.cell.row, x.targeting]))).toEqual([
    [7, 5, 'first'],
    [24, 9, 'last'],
  ]);
});
