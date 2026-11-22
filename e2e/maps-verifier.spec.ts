import { expect, test, type Page } from '@playwright/test';
import type { AnimState } from '../src/game/anim/enemySprites';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import { buildableCells, terrainBlock } from '../src/sim/grid';
import { MAPS, pathLength, positionAlongPath, type MapId } from '../src/sim/map';
import type { EnemyType } from '../src/sim/types';
import { waitForTitle } from './title';

// Milestone 27, independent verifier (Claude Fable), desktop project: mouse
// placement at every edge and beside the path and the river, hit tests on
// the river, cave, cottage and path, the tower panel near the corners,
// special aim over water and the bottom row, sprite facing on every segment,
// the title's map row, and no leftovers between maps. With VERIFIER_SHOTS
// set to a folder, frames are written there for a person to look at.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const NEW_MAPS = ['switchback', 'riverbend'] as const;
const ALL_MAPS = ['meadow', 'switchback', 'riverbend'] as const;

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const titleUi = (page: Page) => page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });
const shots = process.env.VERIFIER_SHOTS;

/** Page errors and console errors seen by this page. */
function watchErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on('pageerror', (e) => seen.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') seen.push(`console: ${m.text()}`);
  });
  return seen;
}

async function openTitle(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
}

async function start(page: Page, map: MapId, gold = 100): Promise<void> {
  await openTitle(page);
  await page.evaluate(
    async ({ m, g }) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame('normal', m);
      t.state().gold = g;
      t.step(1); // redraw the HUD with the test gold
    },
    { m: map, g: gold },
  );
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function click(page: Page, name: string): Promise<void> {
  const p = await rectCentre(page, name);
  await page.mouse.click(p.x, p.y);
}

async function drag(page: Page, from: Point, to: Point, during?: () => Promise<void>): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (during) await during();
  await page.mouse.up();
}

/**
 * Buildable cells worth trying on a map: the first, middle and last buildable cell
 * of the top row, the bottom row, the left column and the right column, plus
 * every buildable cell with a path cell or a water cell as a 4-neighbour
 * (thinned to every third, so the test stays quick).
 */
function probeCells(map: MapId): { edge: Cell[]; beside: Cell[] } {
  const mask = buildableCells(MAPS[map]);
  const ok = (c: Cell) => c.col >= 0 && c.col < 30 && c.row >= 0 && c.row < 15 && mask[c.row * 30 + c.col];
  const line = (cells: Cell[]) => {
    const good = cells.filter(ok);
    return good.length ? [good[0], good[Math.floor(good.length / 2)], good[good.length - 1]] : [];
  };
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  const key = (c: Cell) => c.row * 30 + c.col;
  const edge = [
    ...line(range(30).map((col) => ({ col, row: 0 }))),
    ...line(range(30).map((col) => ({ col, row: 14 }))),
    ...line(range(15).map((row) => ({ col: 0, row }))),
    ...line(range(15).map((row) => ({ col: 29, row }))),
  ].filter((c, i, all) => all.findIndex((o) => key(o) === key(c)) === i); // the corners come up twice
  const beside: Cell[] = [];
  for (let key = 0; key < 450; key++) {
    const c = { col: key % 30, row: Math.floor(key / 30) };
    if (!ok(c)) continue;
    const near = [
      { col: c.col - 1, row: c.row }, { col: c.col + 1, row: c.row }, { col: c.col, row: c.row - 1 }, { col: c.col, row: c.row + 1 },
    ].map((n) => terrainBlock(n, MAPS[map]));
    if (near.includes('path') || near.includes('water')) beside.push(c);
  }
  const edgeKeys = new Set(edge.map(key));
  return { edge, beside: beside.filter((c, i) => i % 3 === 0 && !edgeKeys.has(key(c))) };
}

for (const map of NEW_MAPS) {
  test(`${map}: a mouse drag from the bar places on cells at every edge and right beside the path${map === 'riverbend' ? ' and the river' : ''}`, async ({ page }) => {
    const errors = watchErrors(page);
    const { edge, beside } = probeCells(map);
    expect(edge).toHaveLength(8); // four corners and the middle of each side
    expect(beside.length).toBeGreaterThan(20);
    await start(page, map, 100000);
    const bar = await rectCentre(page, 'bar:longbow');
    const want: Cell[] = [];
    for (const cell of [...edge, ...beside]) {
      await drag(page, bar, centre(cell), async () => {
        expect((await ui(page)).dragging, JSON.stringify(cell)).toEqual({ kind: 'place', tower: 'longbow', cell });
      });
      want.push(cell);
      const towers = (await state(page)).towers.map((t) => t.cell);
      expect(towers, `placed ${JSON.stringify(cell)}`).toContainEqual(cell);
      expect(towers).toHaveLength(want.length);
    }
    const s = await state(page);
    expect(s.gold).toBe(100000 - 40 * want.length);
    if (shots) await page.screenshot({ path: `${shots}/desktop-${map}-edge-towers.png` });
    expect(errors).toEqual([]);
  });

  test(`${map}: drags and clicks on the path, the cave, the cottage${map === 'riverbend' ? ', the river' : ''} and off the grid place nothing and log no error`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 1000);
    const m = MAPS[map];
    const cottage = m.landmarks![0];
    const spots: Record<string, Point> = {
      cave: { x: m.path[0].x + 12, y: m.path[0].y },
      caveRim: { x: m.path[0].x + 6, y: m.path[0].y - 26 },
      cottage: { x: cottage.x + cottage.width / 2, y: cottage.y + cottage.height / 2 },
      cottageCell2: { x: 29 * 32 + 16, y: 10 * 32 + 16 },
      exit: { x: 955, y: m.path[m.path.length - 1].y },
    };
    // The middle of every path segment and every corner.
    m.path.forEach((p, i) => {
      if (i > 0) spots[`segment${i}`] = { x: (p.x + m.path[i - 1].x) / 2, y: (p.y + m.path[i - 1].y) / 2 };
      if (i > 0 && i < m.path.length - 1) spots[`corner${i}`] = { x: p.x, y: p.y };
    });
    if (map === 'riverbend') {
      Object.assign(spots, {
        riverMiddle: { x: 480, y: 320 }, riverLeftEdge: { x: 417, y: 300 }, riverRightEdge: { x: 543, y: 300 },
        riverBottom: { x: 480, y: 478 }, poolTop: { x: 480, y: 162 }, poolCornerGrass: { x: 420, y: 164 },
      });
    }
    const bar = await rectCentre(page, 'bar:musketeer');
    for (const [name, p] of Object.entries(spots)) {
      await drag(page, bar, p);
      expect((await state(page)).towers, `drag onto ${name}`).toEqual([]);
      // Click placement: pick on the bar, click the spot.
      const pickAfterDrag = (await ui(page)).pick;
      if (pickAfterDrag === null) await page.mouse.click(bar.x, bar.y);
      expect((await ui(page)).pick).toBe('musketeer');
      await page.mouse.click(p.x, p.y);
      expect((await state(page)).towers, `click on ${name}`).toEqual([]);
      if ((await ui(page)).pick !== null) await page.mouse.click(bar.x, bar.y); // unpick
      expect((await ui(page)).pick).toBeNull();
    }
    expect((await state(page)).gold).toBe(1000);
    expect(errors).toEqual([]);
  });
}

test('a cell that is path on Meadow and grass on Riverbend, and the reverse, behaves by the map being played (mouse)', async ({ page }) => {
  const errors = watchErrors(page);
  const meadowPath: Cell = { col: 2, row: 7 }; // on Meadow's first lane, grass on Riverbend
  const riverbendPath: Cell = { col: 2, row: 12 }; // on Riverbend's first lane, grass on Meadow
  for (const [map, builds, refuses] of [['riverbend', meadowPath, riverbendPath], ['meadow', riverbendPath, meadowPath]] as const) {
    await start(page, map, 1000);
    const bar = await rectCentre(page, 'bar:longbow');
    await drag(page, bar, centre(refuses));
    expect((await state(page)).towers, `${map} refuses`).toEqual([]);
    await drag(page, bar, centre(builds));
    expect((await state(page)).towers.map((t) => t.cell), `${map} builds`).toEqual([builds]);
    // The hover highlight follows the same rule: pick, hover both.
    await page.mouse.click(bar.x, bar.y);
    await page.mouse.move(centre(refuses).x, centre(refuses).y);
    expect((await ui(page)).hoverCell).toEqual(refuses);
    await page.mouse.click(centre(refuses).x, centre(refuses).y);
    expect((await state(page)).towers).toHaveLength(1);
  }
  expect(errors).toEqual([]);
});

for (const map of NEW_MAPS) {
  test(`${map}: the tower panel stays inside the map for towers near each corner, the cottage and the lanes`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 100000);
    const { edge } = probeCells(map);
    const mask = buildableCells(MAPS[map]);
    const firstOk = (cells: Cell[]) => cells.find((c) => mask[c.row * 30 + c.col])!;
    const cells: Cell[] = [
      ...edge,
      firstOk([{ col: 27, row: 10 }, { col: 27, row: 9 }]), // beside the cottage
      firstOk([{ col: 28, row: 9 }]), // above the cottage
      firstOk([{ col: 29, row: 14 }, { col: 28, row: 14 }]), // bottom right corner
      firstOk([{ col: 0, row: 14 }]),
      firstOk([{ col: 29, row: 0 }]),
      firstOk([{ col: 0, row: 0 }]),
      map === 'switchback' ? { col: 13, row: 4 } : { col: 12, row: 14 },
      map === 'switchback' ? { col: 14, row: 7 } : { col: 17, row: 14 },
    ];
    const seen = new Set<number>();
    for (const cell of cells) {
      if (seen.has(cell.row * 30 + cell.col)) continue;
      seen.add(cell.row * 30 + cell.col);
      expect(await api(page, (a) => a.state().phase)).toBe('setup');
      const built = await page.evaluate((c) => (window.__tarpit as TarpitTestApi).buildAt(c.col, c.row, 'mortar'), cell);
      expect(built.ok, JSON.stringify(cell)).toBe(true);
      await page.mouse.click(centre(cell).x, centre(cell).y);
      const u = await ui(page);
      expect(u.selectedCell, JSON.stringify(cell)).toEqual(cell);
      expect(u.panelOpen).toBe(true);
      const all = await rects(page);
      const names = Object.keys(all).filter((n) => n.startsWith('panel:'));
      expect(names.length).toBeGreaterThanOrEqual(3);
      for (const n of names) {
        const r = all[n];
        expect(r.x >= 0 && r.y >= 0 && r.x + r.width <= 960 && r.y + r.height <= 480, `${n} for ${JSON.stringify(cell)}: ${JSON.stringify(r)}`).toBe(true);
        // No panel button over the tower's own cell.
        const own = { x: cell.col * 32, y: cell.row * 32 };
        expect(r.x < own.x + 32 && own.x < r.x + r.width && r.y < own.y + 32 && own.y < r.y + r.height, `${n} covers ${JSON.stringify(cell)}`).toBe(false);
      }
      if (shots && cell === cells[cells.length - 1]) await page.screenshot({ path: `${shots}/desktop-${map}-panel.png` });
      // Remove it through the panel's own button, which also proves the button takes the click there.
      await click(page, 'panel:sell');
      expect((await state(page)).towers, `sell ${JSON.stringify(cell)}`).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
}

test('Riverbend: a special aimed by mouse over the river and over the bottom row fires where it was aimed', async ({ page }) => {
  const errors = watchErrors(page);
  await start(page, 'riverbend');
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().lives = 1000;
    t.startWave();
    t.step(300);
  });
  for (const at of [{ x: 480, y: 320 }, { x: 480, y: 472 }, { x: 30, y: 470 }]) {
    await page.evaluate(() => ((window.__tarpit as TarpitTestApi).state().specialCharges = 1));
    await click(page, 'special');
    await page.mouse.move(at.x, at.y);
    const u = await ui(page);
    expect(u.special.aiming).toBe('keg');
    expect(u.special.aimPoint).toEqual(at);
    await page.mouse.click(at.x, at.y);
    const ev = (await api(page, (a) => a.events())).find((e) => e.kind === 'special');
    expect(ev, JSON.stringify(at)).toMatchObject({ type: 'keg', x: at.x, y: at.y });
    expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 0 });
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).step(1));
  }
  expect((await state(page)).towers).toEqual([]);
  expect(errors).toEqual([]);
});

// Facing. The direction of travel on a segment, and what each sheet should show for it.
const dirOf = (a: Point, b: Point) => (b.x > a.x ? 'right' : b.x < a.x ? 'left' : b.y > a.y ? 'down' : 'up');
const TYPES: EnemyType[] = ['goblin', 'wolf', 'troll', 'harpy', 'shieldbearer', 'boss'];

for (const map of ALL_MAPS) {
  test(`${map}: every enemy type faces the way it walks on every segment`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map);
    const m = MAPS[map];
    // One enemy of each type in the middle of each segment (ids 1000 + 10 * segment + type index).
    const placed: { id: number; type: EnemyType; distance: number; dir: string }[] = [];
    let along = 0;
    for (let i = 1; i < m.path.length; i++) {
      const len = Math.hypot(m.path[i].x - m.path[i - 1].x, m.path[i].y - m.path[i - 1].y);
      TYPES.forEach((type, k) => placed.push({ id: 1000 + 10 * i + k, type, distance: along + len / 2 + (k - 2.5) * 6, dir: dirOf(m.path[i - 1], m.path[i]) }));
      along += len;
    }
    expect(along).toBe(pathLength(m));
    const anims = await page.evaluate((list) => {
      const t = window.__tarpit as TarpitTestApi;
      const s = t.state();
      s.lives = 100000;
      t.startWave();
      for (const e of list) {
        s.enemies.push({ id: e.id, type: e.type, hp: 1e9, distance: e.distance, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 });
      }
      t.step(2);
      return list.map((e) => t.animState(e.id));
    }, placed);
    placed.forEach((e, i) => {
      const a = anims[i] as AnimState | null;
      expect(a, `${e.type} on a ${e.dir} segment`).not.toBeNull();
      expect(a!.facing, `${e.type} at ${e.distance}`).toBe(e.dir);
      const sideOnly = e.type === 'wolf' || e.type === 'boss';
      // Four-way sheets have a frame per facing and never mirror; the side-only ones mirror for left only.
      expect(a!.flipX, `${e.type} flip on ${e.dir}`).toBe(sideOnly && e.dir === 'left');
      expect(a!.anim).toBe(sideOnly ? `${e.type}-walk` : `${e.type}-walk-${e.dir}`);
    });
    // Switchback is the only map with a leftward segment.
    expect(placed.some((e) => e.dir === 'left')).toBe(map === 'switchback');
    expect(errors).toEqual([]);
  });
}

test('Switchback: one Goblin walked tick by tick turns at each corner within a tick or two and never faces against its movement', async ({ page }) => {
  await start(page, 'switchback');
  const track = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.lives = 100000;
    t.startWave();
    s.spawnedPerGroup = s.spawnedPerGroup.map(() => 1e9);
    s.enemies.push({ id: 7000, type: 'wolf', hp: 1e9, distance: 0, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 });
    const out: { d: number; facing: string; flipX: boolean }[] = [];
    for (let i = 0; i < 870; i++) {
      t.step(1);
      const e = s.enemies.find((x) => x.id === 7000);
      const a = t.animState(7000);
      if (e && a) out.push({ d: e.distance, facing: a.facing, flipX: a.flipX });
    }
    return out;
  });
  expect(track.length).toBeGreaterThan(800);
  const m = MAPS.switchback;
  for (const row of track) {
    const now = positionAlongPath(m, row.d);
    const before = positionAlongPath(m, row.d - 2); // a Wolf moves 2 px per tick
    const dx = now.x - before.x;
    const dy = now.y - before.y;
    const want = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
    expect(row.facing, `at ${row.d}`).toBe(want);
    expect(row.flipX, `flip at ${row.d}`).toBe(want === 'left');
  }
  expect(new Set(track.map((r) => r.facing))).toEqual(new Set(['right', 'down', 'left']));
});

test('title map row: three thumbnails that do not overlap, 72 px tall, 16 px apart, between the level row and the best line', async ({ page }) => {
  const errors = watchErrors(page);
  await page.addInitScript(() => localStorage.setItem('tarpit.best', '{"v":1,"best":{"switchback":{"normal":999,"hard":7},"meadow":{"normal":12}}}'));
  await openTitle(page);
  const r = await rects(page);
  const maps = ALL_MAPS.map((id) => r[`title:map:${id}`]);
  for (const b of maps) {
    expect(b.height).toBeGreaterThanOrEqual(42);
    expect(b.width).toBeGreaterThanOrEqual(42);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width).toBeLessThanOrEqual(960);
  }
  for (let i = 1; i < maps.length; i++) expect(maps[i].x - (maps[i - 1].x + maps[i - 1].width)).toBeGreaterThanOrEqual(8);
  expect(maps.map((b) => [b.x, b.y, b.width, b.height])).toEqual([[266, 326, 132, 72], [414, 326, 132, 72], [562, 326, 132, 72]]);
  // Clear of the level buttons above and Play below by at least 8 px.
  const levelBottom = Math.max(...(['easy', 'normal', 'hard'] as const).map((l) => r[`title:${l}`].y + r[`title:${l}`].height));
  expect(maps[0].y - levelBottom).toBeGreaterThanOrEqual(8);
  expect(r['title:play'].y - (maps[0].y + maps[0].height)).toBeGreaterThanOrEqual(8);

  // The longest best line: inside the canvas, below the thumbnails, above Play, never touching either.
  await click(page, 'title:map:switchback');
  let u = await titleUi(page);
  expect(u.bestLine?.text).toBe('Best on Switchback, Normal: 999 waves');
  const line = u.bestLine!.rect;
  expect(line.x).toBeGreaterThanOrEqual(8);
  expect(line.x + line.width).toBeLessThanOrEqual(952);
  expect(line.y).toBeGreaterThanOrEqual(maps[0].y + maps[0].height);
  expect(line.y + line.height).toBeLessThanOrEqual(r['title:play'].y);
  if (shots) await page.screenshot({ path: `${shots}/desktop-title-best-long.png` });

  // Never another map's score: every map and level pair shows its own or nothing.
  const want: Record<string, string | null> = {
    'meadow/easy': null, 'meadow/normal': 'Best on Meadow, Normal: 12 waves', 'meadow/hard': null,
    'switchback/easy': null, 'switchback/normal': 'Best on Switchback, Normal: 999 waves', 'switchback/hard': 'Best on Switchback, Hard: 7 waves',
    'riverbend/easy': null, 'riverbend/normal': null, 'riverbend/hard': null,
  };
  for (const map of ALL_MAPS) {
    for (const level of ['easy', 'normal', 'hard'] as const) {
      await click(page, `title:map:${map}`);
      await click(page, `title:${level}`);
      u = await titleUi(page);
      expect([u.map, u.difficulty]).toEqual([map, level]);
      expect(u.bestLine?.text ?? null, `${map}/${level}`).toBe(want[`${map}/${level}`]);
    }
  }
  expect(await api(page, (a) => a.scene())).toBe('title'); // nothing started
  expect(errors).toEqual([]);
});

test('title keyboard: Up and Down stop at the ends (no wrap), and the map picked by keys is the one played', async ({ page }) => {
  await openTitle(page);
  const map = async () => (await titleUi(page)).map;
  await page.keyboard.press('ArrowUp'); // already at the first map: stays
  expect(await map()).toBe('meadow');
  for (const want of ['switchback', 'riverbend', 'riverbend', 'riverbend'] as const) {
    await page.keyboard.press('ArrowDown');
    expect(await map()).toBe(want);
  }
  for (const want of ['switchback', 'meadow', 'meadow'] as const) {
    await page.keyboard.press('ArrowUp');
    expect(await map()).toBe(want);
  }
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  expect((await state(page)).map.id).toBe('riverbend');
});

/** Lose the running game at once. */
const lose = (page: Page) =>
  page.evaluate(() => {
    const a = window.__tarpit as TarpitTestApi;
    a.state().lives = 1;
    if (a.state().phase === 'setup') a.startWave();
    a.step(3000);
  });
const freshGame = (page: Page) => page.waitForFunction(() => window.__tarpit?.scene?.() === 'game' && window.__tarpit.state?.().tick === 0);

for (const map of NEW_MAPS) {
  test(`${map}: Play again restarts the same map with nothing left over, twice in a row`, async ({ page }) => {
    const errors = watchErrors(page);
    await start(page, map, 1000);
    for (let round = 0; round < 2; round++) {
      const cell = map === 'switchback' ? { col: 13, row: 4 } : { col: 12, row: 8 };
      expect((await page.evaluate((c) => (window.__tarpit as TarpitTestApi).buildAt(c.col, c.row, 'longbow'), cell)).ok).toBe(true);
      await lose(page);
      expect(await api(page, (a) => a.endScreen())).toBe('lost');
      await click(page, 'playAgain');
      await freshGame(page);
      const s = await state(page);
      expect([s.map.id, s.towers.length, s.enemies.length, s.wave, s.gold, s.lives, s.phase]).toEqual([map, 0, 0, 0, 100, 20, 'setup']);
      expect((await ui(page)).map).toBe(map);
      expect(await api(page, (a) => a.endScreen())).toBeNull();
    }
    expect(errors).toEqual([]);
  });
}

test('Menu, then another map: the picture is exactly a fresh game on that map (no water, cottage, towers or hints left over)', async ({ page, browser }) => {
  const errors = watchErrors(page);
  // What a fresh game on each map looks like, from a clean page each.
  const fresh: Partial<Record<MapId, Buffer>> = {};
  for (const map of ALL_MAPS) {
    const p = await browser.newPage({ viewport: { width: 960, height: 580 } });
    await start(p, map);
    await p.mouse.move(700, 560);
    await p.evaluate(() => (window.__tarpit as TarpitTestApi).step(1));
    fresh[map] = await p.locator('canvas').screenshot();
    await p.close();
  }
  expect(fresh.meadow!.equals(fresh.riverbend!)).toBe(false);
  expect(fresh.switchback!.equals(fresh.riverbend!)).toBe(false);

  // One page session through all three maps, in an order that puts each after each other.
  await openTitle(page);
  const order: MapId[] = ['riverbend', 'meadow', 'switchback', 'riverbend', 'switchback', 'meadow', 'riverbend'];
  for (const [i, map] of order.entries()) {
    await click(page, `title:map:${map}`);
    await click(page, 'title:play');
    await freshGame(page);
    await page.mouse.move(700, 560);
    await page.evaluate(() => (window.__tarpit as TarpitTestApi).step(1));
    const s = await state(page);
    expect([s.map.id, s.towers.length, s.gold]).toEqual([map, 0, 100]);
    const now = await page.locator('canvas').screenshot();
    // step(1) moved the tick counter on the fresh page too, so the frames are comparable byte for byte.
    if (!now.equals(fresh[map]!) && shots) await page.screenshot({ path: `${shots}/desktop-leftover-${i}-${map}.png` });
    expect(now.equals(fresh[map]!), `visit ${i}: ${map} after ${order[i - 1] ?? 'the title'}`).toBe(true);
    // Leave something behind on purpose: towers, a pick with a hover hint, a wave in progress, then lose and go to the menu.
    await page.evaluate(() => ((window.__tarpit as TarpitTestApi).state().gold = 1000));
    const cell = probeCells(map).beside[0];
    expect((await page.evaluate((c) => (window.__tarpit as TarpitTestApi).buildAt(c.col, c.row, 'cannon'), cell)).ok).toBe(true);
    const bar = await rectCentre(page, 'bar:longbow');
    await page.mouse.click(bar.x, bar.y);
    await page.mouse.move(centre(probeCells(map).edge[0]).x, centre(probeCells(map).edge[0]).y);
    expect((await ui(page)).pick).toBe('longbow');
    await lose(page);
    await click(page, 'menu');
    await waitForTitle(page);
    expect((await titleUi(page)).map).toBe(map); // Menu returns with the map just played
  }
  expect(errors).toEqual([]);
});

test('Switchback endless: play past wave 10, lose, and the best line shows on Switchback only', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await openTitle(page);
  await click(page, 'title:map:switchback');
  await click(page, 'title:play');
  await freshGame(page);
  const phase = await api(page, (a) => a.runScript('endlessIdle'));
  expect(phase).toBe('lost');
  const s = await state(page);
  expect([s.map.id, s.endless, s.wave]).toEqual(['switchback', true, 16]); // as the headless table: lost on wave 16
  expect(await api(page, (a) => a.endScreen())).toBe('lost');
  expect(await api(page, (a) => [a.bestScore('normal', 'switchback'), a.bestScore('normal', 'meadow'), a.bestScore('normal', 'riverbend'), a.bestScore('normal')])).toEqual([15, null, null, null]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tarpit.best')!))).toEqual({ v: 1, best: { switchback: { normal: 15 } } });
  await click(page, 'menu');
  await waitForTitle(page);
  let u = await titleUi(page);
  expect([u.map, u.difficulty, u.bestLine?.text]).toEqual(['switchback', 'normal', 'Best on Switchback, Normal: 15 waves']);
  for (const other of ['meadow', 'riverbend'] as const) {
    await click(page, `title:map:${other}`);
    u = await titleUi(page);
    expect(u.bestLine, other).toBeNull();
  }
  await click(page, 'title:map:switchback');
  await click(page, 'title:hard');
  expect((await titleUi(page)).bestLine).toBeNull();
  // A reload keeps the score and goes back to Meadow, which still shows none.
  await page.reload();
  await waitForTitle(page);
  u = await titleUi(page);
  expect([u.map, u.bestLine]).toEqual(['meadow', null]);
  await click(page, 'title:map:switchback');
  expect((await titleUi(page)).bestLine?.text).toBe('Best on Switchback, Normal: 15 waves');
  expect(errors).toEqual([]);
});

test('frame for a person: the Switchback leftward lane with Goblins, Wolves and a Troll', async ({ page }) => {
  test.skip(!shots, 'set VERIFIER_SHOTS to a folder to write frames');
  await start(page, 'switchback');
  await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.lives = 100000;
    t.startWave();
    s.spawnedPerGroup = s.spawnedPerGroup.map(() => 1e9);
    const lane = 560 + 96; // the leftward lane starts here
    const list: [EnemyType, number][] = [['goblin', 30], ['goblin', 60], ['wolf', 95], ['wolf', 130], ['troll', 175], ['goblin', 215], ['shieldbearer', -40], ['harpy', -70], ['boss', -200]];
    list.forEach(([type, d], i) => s.enemies.push({ id: 8000 + i, type, hp: 1e9, distance: lane + d, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 }));
    t.step(2);
  });
  await page.screenshot({ path: `${shots}/desktop-switchback-leftward-lane.png` });
  await page.screenshot({ path: `${shots}/desktop-switchback-leftward-lane-zoom.png`, clip: { x: 280, y: 60, width: 340, height: 180 } });
});
