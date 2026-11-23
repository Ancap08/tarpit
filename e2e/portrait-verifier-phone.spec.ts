import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { facingOf } from '../src/game/anim/facing';
import { GRID_COLS, GRID_ROWS, isBuildableTerrain, terrainBlock } from '../src/sim/grid';
import { MAPS, positionAlongPath, type MapId } from '../src/sim/map';
import type { TowerType } from '../src/sim/types';
import {
  api,
  cellPage,
  fingerFor,
  liftPage,
  worldPage,
  openTitle,
  pageScale,
  rectPage,
  rectPageSize,
  rects,
  startGame,
  state,
  tap,
  tapCell,
  touchDrag,
  ui,
  type Cell,
} from './phone';

// Milestone 32b verifier probes (phone project, 390 x 844 touch portrait).
// Independent of the implementer's spec: positions are checked against the
// documented transform (screen x = 480 - world y, screen y = 76 + world x).

const MAP_IDS: MapId[] = ['meadow', 'switchback', 'riverbend'];
const TOWERS: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];

const buildable = (map: MapId, c: Cell) => isBuildableTerrain(c, MAPS[map]);
function allCells(): Cell[] {
  const out: Cell[] = [];
  for (let col = 0; col < GRID_COLS; col++) for (let row = 0; row < GRID_ROWS; row++) out.push({ col, row });
  return out;
}
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
/** Buildable cells with a 4-neighbour blocked for `why`. */
function beside(map: MapId, why: string): Cell[] {
  return allCells().filter(
    (c) => buildable(map, c) && N4.some(([dc, dr]) => terrainBlock({ col: c.col + dc, row: c.row + dr }, MAPS[map]) === why),
  );
}
function spread<T>(xs: T[], n: number): T[] {
  if (xs.length <= n) return xs;
  return Array.from({ length: n }, (_, i) => xs[Math.floor((i * xs.length) / n)]);
}
/** The buildable cell nearest a grid corner. */
function nearestBuildable(map: MapId, col: number, row: number): Cell {
  return allCells()
    .filter((c) => buildable(map, c))
    .sort((a, b) => Math.hypot(a.col - col, a.row - row) - Math.hypot(b.col - col, b.row - row))[0];
}

const SPOT = nearestBuildable('meadow', 8, 7);
const rich = (page: Page) =>
  page.evaluate(() => {
    const s = (window.__tarpit as TarpitTestApi).state();
    s.gold = 99999;
    s.lives = 999;
  });

test('cellToPage follows the documented transform for all 450 cells', async ({ page }) => {
  await startGame(page);
  const bad = await page.evaluate(() => {
    const t = window.__tarpit!;
    const out: string[] = [];
    for (let col = 0; col < 30; col++)
      for (let row = 0; row < 15; row++) {
        const wx = col * 32 + 16;
        const wy = row * 32 + 16;
        const want = t.canvasToPage(480 - wy, 76 + wx);
        const got = t.cellToPage(col, row);
        if (Math.abs(want.x - got.x) > 0.01 || Math.abs(want.y - got.y) > 0.01) out.push(`${col},${row}`);
      }
    return out;
  });
  expect(bad).toEqual([]);
});

for (const map of MAP_IDS) {
  test(`${map}: tapping the centre of 40+ buildable cells arms exactly that cell`, async ({ page }) => {
    await startGame(page, 'normal', map);
    await rich(page);
    await tap(page, 'bar:cannon');
    const cells = spread(allCells().filter((c) => buildable(map, c)), 60);
    expect(cells.length).toBeGreaterThanOrEqual(40);
    for (const c of cells) {
      await tapCell(page, c);
      expect((await ui(page)).armedCell, `${map} ${c.col},${c.row}`).toEqual(c);
    }
    // And the edges of the cell: 8 px inside each corner still belongs to it.
    const c = cells[Math.floor(cells.length / 2)];
    const centre = await cellPage(page, c);
    const s = await pageScale(page);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      await tapCell(page, cells[0]); // arm another cell first: a second tap on the same cell would build
      await page.touchscreen.tap(centre.x + dx * 13 * s, centre.y + dy * 13 * s);
      expect((await ui(page)).armedCell, `${map} corner ${dx},${dy}`).toEqual(c);
    }
  });

  test(`${map}: drag every tower to corners, cells beside trail, water and cottage; refused cells refuse`, async ({ page }) => {
    await startGame(page, 'normal', map);
    await rich(page);
    const client = await page.context().newCDPSession(page);
    const corners = [nearestBuildable(map, 0, 0), nearestBuildable(map, 29, 0), nearestBuildable(map, 0, 14), nearestBuildable(map, 29, 14)];
    const pool: Cell[] = [...corners, ...spread(beside(map, 'path'), 6), ...spread(beside(map, 'water'), 3), ...spread(beside(map, 'landmark'), 3)];
    const seen = new Set<string>();
    const targets = pool.filter((c) => !seen.has(`${c.col},${c.row}`) && seen.add(`${c.col},${c.row}`));
    let i = 0;
    for (const cell of targets) {
      const type = TOWERS[i++ % TOWERS.length];
      const from = await rectPage(page, `bar:${type}`);
      const finger = await fingerFor(page, cell);
      await touchDrag(page, client, from, finger, async () => {
        expect((await ui(page)).dragging, `${map} ${type} ghost at ${cell.col},${cell.row}`).toMatchObject({ kind: 'place', tower: type, cell });
      });
      const towers = (await state(page)).towers;
      expect(towers.filter((t) => t.cell.col === cell.col && t.cell.row === cell.row).map((t) => t.type), `${map} ${cell.col},${cell.row}`).toEqual([type]);
    }
    expect((await state(page)).towers).toHaveLength(targets.length);
    // Refused cells: path, water, landmark. Milestone 35: a touch ghost snaps to a free buildable
    // cell within 1.5 cells, so a refused cell refuses only with no such cell near (red, cancel).
    const before = (await state(page)).towers.length;
    const taken = new Set((await state(page)).towers.map((t) => `${t.cell.col},${t.cell.row}`));
    const free = (c: Cell) => buildable(map, c) && !taken.has(`${c.col},${c.row}`);
    const nothingNear = (c: Cell) => [-1, 0, 1].every((dr) => [-1, 0, 1].every((dc) => !free({ col: c.col + dc, row: c.row + dr })));
    const refused: [string, Cell | undefined][] = [
      ['path', allCells().find((c) => terrainBlock(c, MAPS[map]) === 'path' && nothingNear(c))],
      ['water', allCells().find((c) => terrainBlock(c, MAPS[map]) === 'water' && nothingNear(c))],
      ['landmark', allCells().find((c) => terrainBlock(c, MAPS[map]) === 'landmark' && nothingNear(c))],
    ];
    for (const [why, cell] of refused) {
      if (!cell) continue;
      const from = await rectPage(page, 'bar:cannon');
      await touchDrag(page, client, from, await fingerFor(page, cell), async () => {
        expect((await ui(page)).dragging, `${map} ${why}`).toMatchObject({ cell });
      });
      expect((await state(page)).towers, `${map} ${why} refused`).toHaveLength(before);
    }
    // An occupied cell (milestone 35): the ghost snaps off it to a free cell nearby, or refuses with none near.
    const occ = targets[0];
    await touchDrag(page, client, await rectPage(page, 'bar:cannon'), await fingerFor(page, occ), async () => {
      expect((await ui(page)).dragging?.cell, `${map} occupied`).not.toEqual(occ);
    });
    expect((await state(page)).towers.filter((t) => t.cell.col === occ.col && t.cell.row === occ.row)).toHaveLength(1);
  });

  test(`${map}: the tower panel for every buildable cell stays in the map, off the tower, and its buttons take taps`, async ({ page }) => {
    await startGame(page, 'normal', map);
    await rich(page);
    const cells = allCells().filter((c) => buildable(map, c));
    // One tower at a time, built by the hook, so panel placement is tested per cell.
    const sampled = spread(cells, 45);
    for (const c of sampled) {
      await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'cannon'), [c.col, c.row]);
      await tapCell(page, c);
      const u = await ui(page);
      expect(u.panelOpen, `${map} panel ${c.col},${c.row}`).toBe(true);
      const r = await rects(page);
      for (const n of ['panel:upgrade', 'panel:sell', 'panel:target', 'panel:close']) {
        const b = r[n];
        expect(b.x, `${n} ${c.col},${c.row}`).toBeGreaterThanOrEqual(0);
        expect(b.y, `${n} ${c.col},${c.row}`).toBeGreaterThanOrEqual(76);
        expect(b.x + b.width, n).toBeLessThanOrEqual(480);
        expect(b.y + b.height, `${n} ${c.col},${c.row}`).toBeLessThanOrEqual(76 + 960);
        expect(b.y + b.height, `${n} reaches the controls`).toBeLessThanOrEqual(r['bar:musketeer'].y);
      }
      // Panel buttons must not cover the tower itself (it must stay tappable).
      const tc = await page.evaluate(([col, row]) => window.__tarpit!.cellToPage(col, row), [c.col, c.row]);
      const tcCanvas = await page.evaluate(([x, y]) => {
        const t = window.__tarpit!;
        const a = t.canvasToPage(0, 0);
        const b = t.canvasToPage(100, 100);
        const s = (b.x - a.x) / 100;
        return { x: (x - a.x) / s, y: (y - a.y) / s };
      }, [tc.x, tc.y]);
      for (const n of ['panel:upgrade', 'panel:sell', 'panel:target', 'panel:close']) {
        const b = r[n];
        const over = tcCanvas.x > b.x && tcCanvas.x < b.x + b.width && tcCanvas.y > b.y && tcCanvas.y < b.y + b.height;
        expect(over, `${map} ${n} covers the tower at ${c.col},${c.row}`).toBe(false);
      }
      await tap(page, 'panel:close');
      expect((await ui(page)).panelOpen, `${map} close ${c.col},${c.row}`).toBe(false);
      await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).sellAt(col, row), [c.col, c.row]);
    }
  });
}

test('enemy sprites sit on the turned path, face the way they move on screen, on all maps, ground and air', async ({ page }) => {
  for (const map of MAP_IDS) {
    await startGame(page, 'normal', map);
    await rich(page);
    // Harpies and the boss come in later waves: play to wave 10 with a strong build, then walk it.
    await api(page, (a) => a.runScript('comboBuild', 10));
    await api(page, (a) => a.startWave());
    const kinds = new Set<string>();
    let checked = 0;
    for (let t = 0; t < 120; t++) {
      const { phase, snap } = await page.evaluate(() => {
        const t = window.__tarpit as TarpitTestApi;
        t.step(15);
        const g = window.__tarpit!.game.scene.getScene('game') as unknown as {
          state: { phase: string; enemies: { id: number; type: string; distance: number; hp: number }[] };
          enemySprites: { views: Map<number, { sprite: { x: number; y: number; flipX: boolean } }> };
        };
        const snap = g.state.enemies.map((e) => {
          const v = g.enemySprites.views.get(e.id);
          const a = window.__tarpit!.animState(e.id);
          return { id: e.id, type: e.type, distance: e.distance, sx: v?.sprite.x, sy: v?.sprite.y, facing: a?.facing };
        });
        return { phase: g.state.phase, snap };
      });
      for (const e of snap) {
        kinds.add(e.type);
        const w = positionAlongPath(MAPS[map], e.distance);
        const sx = 480 - w.y;
        const sy = 76 + w.x;
        expect(e.sx, `${map} ${e.type} x at d=${e.distance}`).toBeCloseTo(sx, 0);
        // The sprite is lifted up (smaller y) or level, never below its ground point by more than a pixel.
        expect(e.sy!, `${map} ${e.type} y at d=${e.distance}`).toBeLessThanOrEqual(sy + 1);
        expect(e.sy!, `${map} ${e.type} y at d=${e.distance}`).toBeGreaterThan(sy - 90);
        // Facing where the path is straight over a stretch both sides.
        if (e.distance > 14) {
          const a = positionAlongPath(MAPS[map], e.distance - 12);
          const b = positionAlongPath(MAPS[map], e.distance + 12);
          const c = positionAlongPath(MAPS[map], e.distance);
          const straight = Math.abs((b.x - c.x) * (c.y - a.y) - (b.y - c.y) * (c.x - a.x)) < 1;
          if (straight) {
            const want = facingOf(-(c.y - a.y), c.x - a.x);
            expect(e.facing, `${map} ${e.type} facing at d=${e.distance}`).toBe(want);
          }
        }
        checked++;
      }
      if (phase !== 'wave') break;
    }
    expect(checked, map).toBeGreaterThan(50);
    expect([...kinds].length, `${map} kinds ${[...kinds]}`).toBeGreaterThanOrEqual(2);
    // go back to the title for the next map
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { toMenu(): void }).toMenu());
    await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  }
});

test('controls: sizes with 47/34 safe-area insets, no overlap, no scroll, no clipping', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 47, bottom: 34 } });
  await startGame(page);
  const r = await rects(page);
  const names = ['startWave', 'speed', 'special', 'bar:musketeer', 'bar:cannon', 'bar:tarpit', 'bar:longbow', 'bar:mortar', 'bar:firepot'];
  for (const n of names) {
    const sz = await rectPageSize(page, n);
    expect(sz.width, n).toBeGreaterThanOrEqual(44);
    expect(sz.height, n).toBeGreaterThanOrEqual(44);
    const b = r[n];
    expect(b.x, n).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, n).toBeLessThanOrEqual(480);
    expect(b.y + b.height, n).toBeLessThanOrEqual(1194);
  }
  for (let i = 0; i < names.length; i++)
    for (let j = i + 1; j < names.length; j++) {
      const a = r[names[i]];
      const b = r[names[j]];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap, `${names[i]} overlaps ${names[j]}`).toBe(false);
    }
  const sc = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, sh: document.documentElement.scrollHeight, ch: document.documentElement.clientHeight }));
  expect(sc.sw).toBeLessThanOrEqual(sc.cw);
  expect(sc.sh).toBeLessThanOrEqual(sc.ch);
  // Inside the viewport on the page too.
  const tl = await page.evaluate(() => window.__tarpit!.canvasToPage(0, 0));
  const br = await page.evaluate(() => window.__tarpit!.canvasToPage(480, 1194));
  expect(tl.y).toBeGreaterThanOrEqual(46.5);
  expect(br.y).toBeLessThanOrEqual(844 - 34 + 0.5);
  // The scale drops with the insets: 763 / 1194.
  expect((br.y - tl.y) / 1194).toBeCloseTo(763 / 1194, 2);
  // Taps still land after the insets: arm a cell by its page point.
  await tap(page, 'bar:cannon');
  await tapCell(page, { col: 12, row: 5 });
  expect((await ui(page)).pick).toBe('cannon');
  await ctx.close();
});

// Fixed in the 32b follow-up (relayout() coalesces). Was: two layout switches inside one frame (relayout() called twice before the first restart's
// create() ran) restart the scene twice; the second create() finds no resume and builds a fresh game.
test('two layout switches in one frame keep the game', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().gold = 7777;
  });
  // Two switches before the first restart's create() runs, as two resizes inside one frame make
  // (resizing the window does this by timing; calling relayout() twice is the deterministic form).
  await page.evaluate(() => {
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as { relayout(): void };
    g.relayout();
    g.relayout();
  });
  await page.waitForTimeout(400);
  expect((await state(page)).gold).toBe(7777);
  expect((await ui(page)).layout).toBe('portrait');
});

test('title: difficulty, map, Play, best line by touch (all three maps)', async ({ page }) => {
  await openTitle(page);
  for (const map of MAP_IDS) {
    await tap(page, `title:map:${map}`);
    expect(((await ui(page)) as unknown as { map: string }).map).toBe(map);
  }
  for (const d of ['easy', 'hard', 'normal']) {
    await tap(page, `title:${d}`);
    expect(((await ui(page)) as unknown as { difficulty: string }).difficulty).toBe(d);
    const size = await rectPageSize(page, `title:${d}`);
    expect(size.height).toBeGreaterThanOrEqual(44);
  }
  for (const n of ['title:play', 'title:map:meadow', 'title:map:switchback', 'title:map:riverbend']) {
    const sz = await rectPageSize(page, n);
    expect(sz.width, n).toBeGreaterThanOrEqual(44);
    expect(sz.height, n).toBeGreaterThanOrEqual(44);
  }
});

test('switching: five quick turns mid-wave keep the game, add no listeners or objects', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const w = window as unknown as { __n: Record<string, number> };
    w.__n = {};
    for (const [name, target] of [['window', window], ['document', document]] as const) {
      const add = target.addEventListener.bind(target);
      const rem = target.removeEventListener.bind(target);
      target.addEventListener = ((t: string, ...r: unknown[]) => {
        w.__n[`${name}:${t}`] = (w.__n[`${name}:${t}`] ?? 0) + 1;
        return (add as (...a: unknown[]) => void)(t, ...r);
      }) as typeof target.addEventListener;
      target.removeEventListener = ((t: string, ...r: unknown[]) => {
        w.__n[`${name}:${t}`] = (w.__n[`${name}:${t}`] ?? 0) - 1;
        return (rem as (...a: unknown[]) => void)(t, ...r);
      }) as typeof target.removeEventListener;
    }
  });
  await startGame(page);
  await rich(page);
  for (const c of [{ col: 2, row: 2 }, { col: 10, row: 12 }, { col: 20, row: 2 }]) await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'cannon'), [c.col, c.row]);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(500));
  const snap = () =>
    page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      const s = t.state();
      const sc = t.game.scene.getScene('game') as unknown as { children: { length: number }; input: { listenerCount(e: string): number }; cameras: { cameras: unknown[] } };
      return {
        gold: s.gold, lives: s.lives, wave: s.wave, tick: s.tick, towers: s.towers.length, enemies: s.enemies.map((e) => e.id).join(),
        zones: s.zones.length, charges: s.specialCharges, recharge: s.specialRechargeTicks,
        objects: sc.children.length, cameras: sc.cameras.cameras.length, canvases: document.querySelectorAll('canvas').length,
        dom: document.body.querySelectorAll('*').length, ptr: sc.input.listenerCount('pointerdown'),
        n: { ...(window as unknown as { __n: Record<string, number> }).__n },
      };
    });
  const base = await snap();
  const objectsPer: number[] = [];
  for (let i = 0; i < 5; i++) {
    for (const [w, h] of [[844, 390], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(60);
    }
    await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
    await page.waitForTimeout(100);
    const s = await snap();
    objectsPer.push(s.objects);
    expect({ ...s, objects: 0, n: {} }).toEqual({ ...base, objects: 0, n: {} });
    for (const k of Object.keys(s.n)) expect(s.n[k], `listener delta ${k} after switch ${i}`).toBeLessThanOrEqual((base.n[k] ?? 0) + 0);
  }
  expect(Math.max(...objectsPer) - Math.min(...objectsPer), `object counts ${objectsPer}`).toBeLessThanOrEqual(2);
  await ctx.close();
});

test('switching during a drag, aim, panel, speed hold, shake, end screen and title leaves nothing stuck', async ({ page }) => {
  await startGame(page);
  await rich(page);
  const client = await page.context().newCDPSession(page);
  const flip = async () => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await page.waitForTimeout(60);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
    await page.waitForTimeout(60);
  };
  // mid-drag
  const from = await rectPage(page, 'bar:cannon');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 6; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y - i * 25 }] });
  expect((await ui(page)).dragging).not.toBeNull();
  await flip();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  let u = await ui(page);
  expect(u.dragging).toBeNull();
  expect((await state(page)).towers).toHaveLength(0);
  // still usable: tap-tap build
  await tap(page, 'bar:cannon');
  await tapCell(page, SPOT);
  await tapCell(page, SPOT);
  expect((await state(page)).towers).toHaveLength(1);
  // open panel
  await tapCell(page, SPOT);
  expect((await ui(page)).panelOpen).toBe(true);
  await flip();
  u = await ui(page);
  expect(u.panelOpen).toBe(false);
  await tapCell(page, SPOT);
  expect((await ui(page)).panelOpen).toBe(true);
  await tap(page, 'panel:close');
  // aim
  await tap(page, 'startWave');
  await api(page, (a) => a.step(60));
  await tap(page, 'special');
  expect((await ui(page)).special.aiming).not.toBeNull();
  await flip();
  expect((await ui(page)).special.aiming).toBeNull();
  // speed hold
  const sp = await rectPage(page, 'speed');
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [sp] });
  await page.waitForTimeout(600);
  expect(await api(page, (a) => a.speed())).toBe(3);
  await flip();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await api(page, (a) => a.speed())).toBe(1);
  // end screen
  await api(page, (a) => a.runScript('comboBuild'));
  await page.evaluate(() => {
    const s = (window.__tarpit as TarpitTestApi).state();
    s.lives = 0;
  });
  const e = await api(page, (a) => a.endScreen());
  await flip();
  expect(await api(page, (a) => a.endScreen())).toBe(e);
  // title
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { toMenu(): void }).toMenu());
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  await tap(page, 'title:hard');
  await tap(page, 'title:map:riverbend');
  await flip();
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  const t = (await ui(page)) as unknown as { difficulty: string; map: string };
  expect(t).toMatchObject({ difficulty: 'hard', map: 'riverbend' });
});

test('a square window and the boundary: which layout, and no flapping', async ({ page }) => {
  await startGame(page);
  const layouts: string[] = [];
  for (const [w, h] of [[600, 600], [600, 601], [601, 600], [600, 600], [600, 599]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(80);
    layouts.push(`${w}x${h}:${await page.evaluate(() => window.__tarpit!.layout())}`);
  }
  expect(layouts).toEqual(['600x600:landscape', '600x601:portrait', '601x600:landscape', '600x600:landscape', '600x599:landscape']);
});

test('an upright iPad (768 x 1024) gets portrait and is usable', async ({ browser }, info) => {
  const ctx = await browser.newContext({ viewport: { width: 768, height: 1024 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await startGame(page);
  expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('portrait');
  await tap(page, 'bar:musketeer');
  await tapCell(page, { col: 6, row: 6 });
  await tapCell(page, { col: 6, row: 6 });
  expect((await state(page)).towers).toHaveLength(1);
  await page.screenshot({ path: info.outputPath('ipad-portrait.png') });
  await ctx.close();
});

// Fixed in the 32b follow-up (portrait shakes sideways only). Was: shakeOffset never scrolls down, which keeps the controls out of view in landscape, but in
// portrait the status strip is above the map, so a scroll up (y offset below 0) slides the strip's bottom edge
// (dark band and divider line) into the top 6 to 8 px of the map for the shake's 220 to 600 ms.
test('a shake never shows the status strip inside the map', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  const minY = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const g = window.__tarpit!.game.scene.getScene('game') as unknown as { fx: { shake(s: { ms: number; px: number }): void } };
        g.fx.shake({ ms: 600, px: 8 });
        let min = 0;
        const t0 = performance.now();
        const loop = () => {
          const cam = window.__tarpit!.fx()!.camera;
          min = Math.min(min, cam.y);
          // 32b follow-up: and the map does shake (sideways in portrait).
          if (cam.x !== 0) (window as unknown as { __shookX: boolean }).__shookX = true;
          if (performance.now() - t0 < 700) requestAnimationFrame(loop);
          else resolve(min);
        };
        loop();
      }),
  );
  expect(minY).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => (window as unknown as { __shookX?: boolean }).__shookX)).toBe(true);
});

// Re-verify of 2bcc13b: edges of the coalesced layout switch.
const sceneKeys = (page: Page) => page.evaluate(() => window.__tarpit!.game.scene.getScenes(true).map((s) => s.scene.key));

test('switch edge: a relayout during create() keeps the game and ends on the window layout', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().gold = 4321;
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as { relayout(): void; events: { once(e: string, f: () => void): void } };
    g.events.once('create', () => g.relayout());
    g.relayout();
  });
  await page.waitForTimeout(500);
  expect((await state(page)).gold).toBe(4321);
  expect(await sceneKeys(page)).toEqual(['game']);
});

test('switch edge: Play again or Menu followed by a relayout in the same frame never resurrects the old game', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().gold = 4321;
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as { relayout(): void; playAgain(): void };
    g.playAgain();
    g.relayout();
  });
  await page.waitForTimeout(500);
  expect(await sceneKeys(page)).toEqual(['game']);
  expect((await state(page)).gold, 'Play again then relayout').toBe(100);
});

// Fixed in the 32b follow-up (a leaving scene ignores relayout()). Was: toMenu() then relayout() in one frame
// (a turn in the frame Menu is tapped) left the title and a restarted game scene both active.
test('switch edge: Menu followed by a relayout in the same frame leaves only the title', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => {
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as { relayout(): void; toMenu(): void };
    g.toMenu();
    g.relayout();
  });
  await page.waitForTimeout(500);
  expect(await sceneKeys(page), 'Menu then relayout').toEqual(['title']);
});

test('switch edge: the title to game transition, a won screen, Keep going', async ({ page }) => {
  await openTitle(page);
  await page.evaluate(() => {
    const t = window.__tarpit!.game.scene.getScene('title') as unknown as { play(d: string, m: string): void; relayout(): void };
    t.play('normal', 'meadow');
    t.relayout();
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(500);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  expect(await sceneKeys(page)).toEqual(['game']);
  expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('portrait');
  // Won: switch with the screen up, press Keep going, switch again.
  await api(page, (a) => a.runScript('comboBuild'));
  expect(await api(page, (a) => a.endScreen())).toBe('won');
  const before = await state(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  expect(await api(page, (a) => a.endScreen())).toBe('won');
  await tap(page, 'keepGoing');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  const after = await state(page);
  expect(after.wave).toBe(before.wave);
  expect(after.phase).not.toBe('won');
  expect(await api(page, (a) => a.endScreen())).toBeNull();
  // Lost.
  await page.evaluate(() => {
    (window.__tarpit as TarpitTestApi).state().lives = 0;
  });
  await api(page, (a) => a.startWave());
  await api(page, (a) => a.step(5));
  const lost = await api(page, (a) => a.endScreen());
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForTimeout(400);
  expect(await api(page, (a) => a.endScreen())).toBe(lost);
});

test('switch edge: the live loop never runs extra ticks across a burst of switches', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
  await tap(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await tap(page, 'startWave');
  const tick = () => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { tick: number } }).state.tick);
  const t0 = await tick();
  const w0 = Date.now();
  for (let i = 0; i < 8; i++) {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.waitForTimeout(400);
  const t1 = await tick();
  const secs = (Date.now() - w0) / 1000;
  expect(t1).toBeGreaterThan(t0);
  expect(t1 - t0).toBeLessThanOrEqual(Math.ceil(secs * 60) + 5);
  expect(await sceneKeys(page)).toEqual(['game']);
  expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('portrait');
});

for (const [w, h] of [[390, 844], [390, 664], [768, 1024]] as const) {
  test(`lift ${w}x${h}: edge rows and columns reachable by tower drag and special aim; cancel rules`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    await startGame(page, 'normal', 'meadow');
    await rich(page);
    const client = await ctx.newCDPSession(page);
    const scale = await pageScale(page);
    const lift = await liftPage(page);
    expect(lift / scale).toBeGreaterThan(40);
    expect(lift, `lift in CSS px at ${w}x${h}`).toBeGreaterThan(44);
    expect(lift).toBeLessThan(52);
    const edge = (c: Cell) => c.col <= 1 || c.col >= GRID_COLS - 2 || c.row <= 1 || c.row >= GRID_ROWS - 2;
    const cells = allCells().filter((c) => buildable('meadow', c) && edge(c));
    // one per edge: top (col<=1), bottom (col>=28), both side columns (row 0, row 14)
    const pick = (f: (c: Cell) => boolean) => cells.filter(f)[0];
    const all = [pick((c) => c.col <= 1), pick((c) => c.col >= GRID_COLS - 2), pick((c) => c.row <= 1 && c.col > 3), pick((c) => c.row >= GRID_ROWS - 2 && c.col > 3), nearestBuildable('meadow', 29, 14), nearestBuildable('meadow', 0, 0)];
    const targets = all.filter((c, k) => all.findIndex((d) => d.col === c.col && d.row === c.row) === k);
    let i = 0;
    for (const cell of targets) {
      const type = TOWERS[i++ % 6];
      const from = await rectPage(page, `bar:${type}`);
      await touchDrag(page, client, from, await fingerFor(page, cell), async () => {
        expect((await ui(page)).dragging, `${w}x${h} ${type}`).toMatchObject({ cell });
      });
      expect((await state(page)).towers.some((t) => t.cell.col === cell.col && t.cell.row === cell.row && t.type === type), `${w}x${h} built ${cell.col},${cell.row}`).toBe(true);
    }
    // Cancel: release with the lifted point above the map (finger high on the screen), tower count unchanged.
    const n = (await state(page)).towers.length;
    const top = await worldPage(page, { x: 2, y: 240 });
    await touchDrag(page, client, await rectPage(page, 'bar:cannon'), { x: top.x, y: top.y - 30 * scale }, undefined);
    expect((await state(page)).towers).toHaveLength(n);
    // Special aim at the edges.
    await tap(page, 'startWave');
    await api(page, (a) => a.step(30));
    const last = () => api(page, (a) => {
      const e = a.state().events.filter((x) => x.kind === 'special');
      return e.length ? (e[e.length - 1] as { x: number; y: number }) : null;
    });
    for (const wp of [{ x: 12, y: 240 }, { x: 948, y: 240 }, { x: 480, y: 12 }, { x: 480, y: 468 }]) {
      await page.evaluate(() => {
        const s = (window.__tarpit as TarpitTestApi).state();
        s.specialCharges = 1;
        s.specialRechargeTicks = 0;
      });
      await tap(page, 'special');
      const p = await worldPage(page, wp);
      await touchDrag(page, client, p, { x: p.x, y: p.y + lift }, async () => {
        expect((await ui(page)).special.holding).toBe(true);
      });
      const e = await last();
      expect(Math.abs(e!.x - wp.x), `${w}x${h} aim ${wp.x},${wp.y}`).toBeLessThan(3);
      expect(Math.abs(e!.y - wp.y), `${w}x${h} aim ${wp.x},${wp.y}`).toBeLessThan(3);
    }
    // A press that starts on the controls cancels aiming and fires nothing.
    await page.evaluate(() => {
      const s = (window.__tarpit as TarpitTestApi).state();
      s.specialCharges = 1;
      s.specialRechargeTicks = 0;
    });
    await tap(page, 'special');
    const before = await last();
    const bar = await rectPage(page, 'bar:cannon');
    await touchDrag(page, client, bar, { x: bar.x, y: bar.y - 200 * scale });
    expect(await last()).toEqual(before);
    expect((await ui(page)).special.aiming).toBeNull();
    await ctx.close();
  });
}

test('aim text goes in the strip in portrait, the preview returns, Special again cancels', async ({ page }) => {
  await startGame(page);
  await rich(page);
  await tap(page, 'startWave');
  await api(page, (a) => a.step(60));
  const next = () => api(page, (a) => a.hudText().next);
  const preview = await next();
  await tap(page, 'special');
  const aim = await next();
  expect(aim).not.toBe(preview);
  expect(aim).toMatch(/Tap the trail|Powder Keg|hold/i);
  expect(aim).not.toMatch(/Special again cancels/);
  // nothing over the map: no banner text objects visible
  const bannerVisible = await page.evaluate(() => {
    const g = window.__tarpit!.game.scene.getScene('game') as unknown as { bannerMain: { text: string } };
    return g.bannerMain.text;
  });
  expect(bannerVisible).toBe('');
  await tap(page, 'special');
  expect((await ui(page)).special.aiming).toBeNull();
  expect(await next()).toBe(preview);
  // and after firing
  await tap(page, 'special');
  const at = await worldPage(page, { x: 300, y: 200 });
  await page.touchscreen.tap(at.x, at.y);
  expect((await ui(page)).special.aiming).toBeNull();
  expect(await next()).not.toMatch(/Tap the trail/);
});
