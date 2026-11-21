import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 11 verifier probes (Claude Sonnet), independent of new-towers.spec.ts.
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

const TYPES = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'] as const;
const COST = { musketeer: 50, cannon: 80, tarpit: 60, longbow: 40, mortar: 110, firepot: 70 };

test('bar geometry: six 148x42 buttons, 8 px gaps, inside the canvas, no overlaps, clear of row 1', async ({ page }) => {
  await startGame(page);
  const r = await rects(page);
  const bar = TYPES.map((t) => r[`bar:${t}`]);
  expect(bar.map((b) => b.x)).toEqual([16, 172, 328, 484, 640, 796]);
  for (const b of bar) {
    expect([b.width, b.height]).toEqual([148, 42]); // 42 tall from milestone 14
    expect(b.x + b.width).toBeLessThanOrEqual(960);
    expect(b.y + b.height).toBeLessThanOrEqual(580);
  }
  for (let i = 1; i < bar.length; i++) expect(bar[i].x - (bar[i - 1].x + bar[i - 1].width)).toBe(8);
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  for (let i = 0; i < bar.length; i++) for (let j = i + 1; j < bar.length; j++) expect(overlap(bar[i], bar[j])).toBe(false);
  // Row 1 (status and wave controls) is y 0..50 and the bar sits in row 2.
  for (const b of bar) expect(b.y).toBeGreaterThanOrEqual(50 + 480);
  expect(overlap(bar[0], r.startWave)).toBe(false);
  expect(overlap(bar[5], r.speed)).toBe(false);
  for (const name of ['startWave', 'speed']) {
    const o = r[name];
    for (const b of bar) expect(overlap(o, b), `${name} vs bar`).toBe(false);
  }
});

test('(a) pick each of the six towers in turn and place one of each: gold 1000 - 410 = 590', async ({ page }) => {
  await startGame(page);
  await setGold(page, 1000);
  const cells: Cell[] = [
    { col: 6, row: 5 },
    { col: 9, row: 5 },
    { col: 14, row: 6 },
    { col: 14, row: 8 },
    { col: 17, row: 6 },
    { col: 10, row: 9 },
  ];
  for (let i = 0; i < 6; i++) {
    await settle(page);
    await clickBar(page, `bar:${TYPES[i]}`);
    expect((await ui(page)).pick).toBe(TYPES[i]);
    await clickCell(page, cells[i]);
  }
  const s = await state(page);
  expect(s.towers.map((t) => t.type).sort()).toEqual([...TYPES].sort());
  expect(new Set(s.towers.map((t) => `${t.cell.col},${t.cell.row}`)).size).toBe(6);
  expect(Object.values(COST).reduce((a, b) => a + b, 0)).toBe(410);
  expect(s.gold).toBe(590);
});

test('(b) Mortar pick and hover: ui() reports pick and hoverCell (circles are pixel-only, not asserted)', async ({ page }) => {
  await startGame(page);
  await setGold(page, 1000);
  await clickBar(page, 'bar:mortar');
  await page.mouse.move(17 * 32 + 16, 6 * 32 + 16);
  await settle(page);
  expect(await ui(page)).toMatchObject({ pick: 'mortar', hoverCell: { col: 17, row: 6 } });
});

test('(c) Fire Pot is not pickable at 69 gold and pickable at 70', async ({ page }) => {
  await startGame(page);
  await setGold(page, 69);
  await settle(page);
  await clickBar(page, 'bar:firepot');
  expect((await ui(page)).pick).toBeNull();
  await setGold(page, 70);
  await settle(page);
  await clickBar(page, 'bar:firepot');
  expect((await ui(page)).pick).toBe('firepot');
});

test('(d) selling an upgraded Longbow through the panel refunds 49', async ({ page }) => {
  await startGame(page);
  await setGold(page, 100);
  await clickBar(page, 'bar:longbow');
  await clickCell(page, { col: 6, row: 5 });
  await page.keyboard.press('Escape');
  await clickCell(page, { col: 6, row: 5 });
  await clickBar(page, 'panel:upgrade');
  expect((await state(page)).gold).toBe(100 - 40 - 30);
  await clickBar(page, 'panel:sell');
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100 - 70 + 49);
});

test('(e) three adjacent Musketeers: they exist, nothing throws, label sizes and visibility read from the scene', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await startGame(page);
  await setGold(page, 1000);
  // The pick stays active after placing; clicking the same bar button again would toggle it off.
  await clickBar(page, 'bar:musketeer');
  for (const col of [6, 7, 8]) await clickCell(page, { col, row: 5 });
  await settle(page);
  expect((await state(page)).towers.map((t) => t.cell.col)).toEqual([6, 7, 8]);
  // The test API exposes nothing about labels; this reads the scene's private
  // label map (a probe, not a supported hook).
  const labels = await page.evaluate(() => {
    const scene = (window.__tarpit as TarpitTestApi).game.scene.getScene('game') as unknown as {
      labels: { labels: Map<number, { visible: boolean; style: { fontSize: string }; text: string }> };
    };
    return [...scene.labels.labels.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, l]) => ({ text: l.text, visible: l.visible, size: l.style.fontSize }));
  });
  expect(labels).toEqual([
    { text: 'Musket', visible: true, size: '10px' },
    { text: 'Musket', visible: false, size: '10px' },
    { text: 'Musket', visible: true, size: '10px' },
  ]);
  expect(errors).toEqual([]);
});

test('(f) Tar Pit (14,6) + Fire Pot (14,8): no slowed-and-burning enemy at tick 686, Goblin 0 has both at 687', async ({ page }) => {
  await startGame(page);
  await setGold(page, 1000);
  await clickBar(page, 'bar:tarpit');
  await clickCell(page, { col: 14, row: 6 });
  await clickBar(page, 'bar:firepot');
  await clickCell(page, { col: 14, row: 8 });
  await page.keyboard.press('Escape');
  await clickBar(page, 'startWave');
  const both = (a: TarpitTestApi) =>
    a.state().enemies.filter((x) => x.slowTicksLeft > 0 && (x.burnTicksLeft ?? 0) > 0).map((x) => x.id);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).step(686));
  expect(await api(page, both)).toEqual([]);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).step(1));
  expect(await api(page, both)).toEqual([0]);
  const e = await api(page, (a) => a.state().enemies.find((x) => x.id === 0)!);
  expect(e.slowTicksLeft).toBeGreaterThan(0);
  expect(e.burnTicksLeft).toBeGreaterThan(0);
});
