import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { decorFor } from '../src/game/decor/recipe';
import { COLORS } from '../src/game/palette';
import { MAP_IDS, MAPS, type MapId } from '../src/sim/map';
import { isBuildableTerrain } from '../src/sim/grid';
import { TOWER_DEFS } from '../src/sim';
import { waitForTitle } from './title';

// Milestone 34 verifier (desktop project, 960 x 580). Independent of e2e/decor.spec.ts.

type Cell = { col: number; row: number };
type Scene = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const decor = (page: Page) => page.evaluate(() => window.__tarpit!.decor()!);
const frames = (page: Page, n = 3) =>
  page.evaluate((k) => new Promise((r) => {
    let left = k;
    const f = () => (--left <= 0 ? r(null) : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);
const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

async function startTest(page: Page, map: MapId = 'meadow', counters = false): Promise<void> {
  if (counters) {
    await page.addInitScript(() => {
      const w = window as unknown as { __lc: number };
      w.__lc = 0;
      const add = EventTarget.prototype.addEventListener;
      const rem = EventTarget.prototype.removeEventListener;
      const seen = new WeakMap<object, Set<string>>();
      const key = (_t: EventTarget, type: string, cb: unknown, o: unknown) => `${type}|${String(cb)}|${JSON.stringify(typeof o === 'object' ? { c: (o as { capture?: boolean })?.capture } : { c: !!o })}`;
      EventTarget.prototype.addEventListener = function (this: EventTarget, type: string, cb: any, o?: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const s = seen.get(this) ?? new Set();
        seen.set(this, s);
        const k = key(this, type, cb, o) + '|' + (cb && (cb.__id ??= Math.random()));
        if (!s.has(k)) { s.add(k); w.__lc++; }
        return add.call(this, type, cb, o);
      };
      EventTarget.prototype.removeEventListener = function (this: EventTarget, type: string, cb: any, o?: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
        const s = seen.get(this);
        const k = key(this, type, cb, o) + '|' + (cb && cb.__id);
        if (s?.delete(k)) w.__lc--;
        return rem.call(this, type, cb, o);
      };
    });
  }
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate((m) => (window.__tarpit as TarpitTestApi).startGame('normal', m), map);
  await frames(page, 2);
}
const sceneOf = (page: Page) => page; // readability
void sceneOf;

const build = (page: Page, c: Cell, type = 'musketeer') => page.evaluate(([col, row, t]) => window.__tarpit!.buildAt!(col as number, row as number, t as 'musketeer').ok, [c.col, c.row, type]);
const sell = (page: Page, c: Cell) => page.evaluate(([col, row]) => window.__tarpit!.sellAt!(col, row).ok, [c.col, c.row]);
const gold = (page: Page) => page.evaluate(() => { window.__tarpit!.state!().gold = 1e6; });
/** Ids of the growth images that are visible, read from the scene's own objects. */
const visibleIds = (page: Page) =>
  page.evaluate(() => {
    const s = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
    return s.living.growth.filter((v: Scene) => v.top.visible).map((v: Scene) => v.g.id as number).sort((a: number, b: number) => a - b);
  });
const allIds = (n: number) => Array.from({ length: n }, (_, i) => i);

for (const id of MAP_IDS) {
  test(`${id}: draw order puts all decoration under everything that matters`, async ({ page }) => {
    await startTest(page, id);
    const r = await page.evaluate(() => {
      const s = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
      s.sys.displayList.depthSort?.();
      const list: Scene[] = s.children.list;
      const L = s.living;
      const decorObjs = new Set<unknown>([L.ground, L.water, L.low, L.air, ...L.growth.map((v: Scene) => v.top), s.town.layer, ...L.clouds].filter(Boolean));
      let maxDecor = -1;
      list.forEach((o, i) => { if (decorObjs.has(o)) maxDecor = i; });
      const before = list.slice(0, maxDecor + 1).filter((o) => !decorObjs.has(o)).map((o) => `${o.type}:${o.texture?.key ?? ''}`);
      const depths = [...decorObjs].map((o) => (o as Scene).depth as number);
      // Everything drawn after: the layers and graphics of enemies, shots, bars (names for the report).
      const after = list.slice(maxDecor + 1).map((o) => o.type as string);
      return { n: list.length, maxDecor, before, depths, afterCount: after.length, afterTypes: [...new Set(after)] };
    });
    console.log(`${id}: decoration is display-list items up to ${r.maxDecor} of ${r.n}; non-decoration before that: ${JSON.stringify(r.before)}; after: ${r.afterTypes}`);
    expect(Math.max(...r.depths)).toBe(0);
    expect(r.before).toEqual([]);
    expect(r.afterCount).toBeGreaterThan(5);
  });

  test(`${id}: clearance of every tree and bush against the biggest sprites (overlap is harmless: drawn under)`, async () => {
    const map = MAPS[id];
    const d = decorFor(map);
    const segDist = (px: number, py: number) => {
      let best = Infinity;
      for (let i = 1; i < map.path.length; i++) {
        const a = map.path[i - 1];
        const b = map.path[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(px - a.x - t * dx, py - a.y - t * dy));
      }
      return best;
    };
    // Sprite extents from anim/sheets.ts: Troll 16x16 at scale 3 (half 24), boss 50x50 at scale 2 lifted 30 (half 50, so 80 above the path), Harpy 16 at 2 lifted 16 (half 16, so 32 above).
    let troll = Infinity;
    let boss = Infinity;
    let harpy = Infinity;
    let hp = Infinity;
    for (const g of d.growth) {
      const edge = segDist(g.x, g.y) - g.r;
      troll = Math.min(troll, edge - 24);
      harpy = Math.min(harpy, edge - 32);
      boss = Math.min(boss, edge - 80);
      hp = Math.min(hp, edge - 24 - 8); // hp bar sits just above a Troll's sprite
    }
    console.log(`${id}: smallest canopy-edge clearance to the trail centreline ${Math.round(edge0(d.growth, segDist))} px; to a Troll sprite edge ${troll.toFixed(1)}, Troll hp bar ${hp.toFixed(1)}, Harpy (lifted) ${harpy.toFixed(1)}, boss (lifted, worst direction) ${boss.toFixed(1)}`);
    expect(troll).toBeGreaterThan(0);
  });

  test(`${id}: every tree and bush cell builds like any other and hides exactly its own growth, once`, async ({ page }) => {
    await startTest(page, id);
    await gold(page);
    const d = await decor(page);
    const n = d.growth.length;
    expect(await visibleIds(page)).toEqual(allIds(n));
    for (const g of d.growth) {
      expect(await build(page, g), `build on growth ${g.id}`).toBe(true);
      expect((await decor(page)).hidden).toEqual([g.id]);
      expect(await visibleIds(page)).toEqual(allIds(n).filter((i) => i !== g.id));
      expect(await sell(page, g)).toBe(true);
      expect((await decor(page)).hidden).toEqual([]);
      expect(await visibleIds(page)).toEqual(allIds(n));
    }
    // Every cell of growth at once, then sold one by one.
    for (const g of d.growth) expect(await build(page, g)).toBe(true);
    expect((await decor(page)).hidden).toEqual(allIds(n));
    expect(await visibleIds(page)).toEqual([]);
    for (const g of d.growth) {
      expect(await sell(page, g)).toBe(true);
      const hidden = (await decor(page)).hidden;
      expect(hidden).toEqual(allIds(n).filter((i) => i > g.id));
      expect(await visibleIds(page)).toEqual(allIds(n).filter((i) => i <= g.id));
    }
    // No duplicate growth images: exactly n images with a tree or bush texture.
    const count = await page.evaluate(() => {
      const s = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
      return s.children.list.filter((o: Scene) => /^decor-(tree|bush)/.test(o.texture?.key ?? '')).length;
    });
    expect(count).toBe(n);
  });

  test(`${id}: every tower type builds on a tree cell and a bush cell exactly as on plain grass`, async ({ page }) => {
    await startTest(page, id);
    await gold(page);
    const d = await decor(page);
    const tree = d.growth.find((g) => g.kind === 'tree')!;
    const bush = d.growth.find((g) => g.kind === 'bush')!;
    const taken = new Set(d.growth.map((g) => `${g.col},${g.row}`));
    const plain = await page.evaluate((busy) => {
      const out: Cell[] = [];
      for (let row = 0; row < 15 && out.length < 12; row++) for (let col = 0; col < 30; col++) {
        if (busy.includes(`${col},${row}`)) continue;
        if (window.__tarpit!.buildAt!(col, row, 'musketeer').ok) { window.__tarpit!.sellAt!(col, row); out.push({ col, row }); }
      }
      return out;
    }, [...taken]);
    for (const type of ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot']) {
      const onPlain = await build(page, plain[0], type);
      const onTree = await build(page, tree, type);
      const onBush = await build(page, bush, type);
      expect({ type, onTree, onBush }).toEqual({ type, onTree: onPlain, onBush: onPlain });
      if (onTree) {
        const t = await page.evaluate(([c, r]) => window.__tarpit!.state!().towers.find((x) => x.cell.col === c && x.cell.row === r)!, [tree.col, tree.row]);
        const p = await page.evaluate(([c, r]) => window.__tarpit!.state!().towers.find((x) => x.cell.col === c && x.cell.row === r)!, [plain[0].col, plain[0].row]);
        // The sim treats the cells alike: same tower fields apart from the cell.
        expect({ ...t, cell: null, id: 0 }).toEqual({ ...p, cell: null, id: 0 });
      }
      await sell(page, plain[0]);
      await sell(page, tree);
      await sell(page, bush);
      expect((await decor(page)).hidden).toEqual([]);
    }
  });

  test(`${id}: sell, move in planning, upgrade and undo, Play again and a layout switch restore growth exactly`, async ({ page }) => {
    await startTest(page, id);
    await gold(page);
    const d = await decor(page);
    const n = d.growth.length;
    const [a, b, c] = d.growth;
    const taken = new Set(d.growth.map((g) => `${g.col},${g.row}`));
    const free = (await page.evaluate((busy) => {
      for (let row = 0; row < 15; row++) for (let col = 0; col < 30; col++) {
        if (busy.includes(`${col},${row}`)) continue;
        if (window.__tarpit!.buildAt!(col, row, 'musketeer').ok) { window.__tarpit!.sellAt!(col, row); return { col, row }; }
      }
      return null;
    }, [...taken]))!;
    const hidden = async () => (await decor(page)).hidden;
    await build(page, a);
    await build(page, b);
    expect(await hidden()).toEqual([a.id, b.id].sort((x, y) => x - y));
    // Upgrade, then undo: the tower and the hidden set stay.
    const up = await page.evaluate(([col, row]) => window.__tarpit!.upgradeAt!(col, row).ok, [a.col, a.row]);
    if (up) {
      expect(await hidden()).toEqual([a.id, b.id].sort((x, y) => x - y));
      await page.evaluate(([col, row]) => window.__tarpit!.undoUpgradeAt!(col, row), [a.col, a.row]);
      expect(await hidden()).toEqual([a.id, b.id].sort((x, y) => x - y));
    }
    // Move a's tower to free ground: a returns once. Move it onto c: c hides. Move it back onto a.
    const mv = (f: Cell, t: Cell) => page.evaluate(([fc, fr, tc, tr]) => window.__tarpit!.moveAt!(fc, fr, tc, tr).ok, [f.col, f.row, t.col, t.row]);
    expect(await mv(a, free)).toBe(true);
    expect(await hidden()).toEqual([b.id]);
    expect(await visibleIds(page)).toEqual(allIds(n).filter((i) => i !== b.id));
    expect(await mv(free, c)).toBe(true);
    expect(await hidden()).toEqual([b.id, c.id].sort((x, y) => x - y));
    expect(await mv(c, a)).toBe(true);
    expect(await hidden()).toEqual([a.id, b.id].sort((x, y) => x - y));
    // A mid-wave sale: start the wave, sell, the tree is back.
    await page.evaluate(() => window.__tarpit!.startWave!());
    await page.evaluate(() => window.__tarpit!.step!(30));
    expect(await sell(page, a)).toBe(true);
    expect(await hidden()).toEqual([b.id]);
    // A layout switch keeps the towers (if the game keeps them) and the matching hidden set.
    const towersBefore = await page.evaluate(() => window.__tarpit!.state!().towers.map((t) => `${t.cell.col},${t.cell.row}`).sort());
    await page.setViewportSize({ width: 480, height: 1000 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
    await frames(page, 4);
    const towersAfter = await page.evaluate(() => window.__tarpit!.state!().towers.map((t) => `${t.cell.col},${t.cell.row}`).sort());
    expect(towersAfter).toEqual(towersBefore);
    expect(await hidden()).toEqual([b.id]);
    expect(await visibleIds(page)).toEqual(allIds(n).filter((i) => i !== b.id));
    await page.setViewportSize({ width: 960, height: 580 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await frames(page, 4);
    expect(await hidden()).toEqual([b.id]);
    // Play again: new game, all growth back, none hidden.
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as Scene).playAgain());
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
    await frames(page, 3);
    expect(await hidden()).toEqual([]);
    expect(await visibleIds(page)).toEqual(allIds(n));
    expect((await decor(page)).growth).toEqual(d.growth);
  });

  for (const layout of ['landscape', 'portrait'] as const) {
    test(`${id} ${layout}: test mode frames are byte-identical across two loads and over 3 seconds`, async ({ page }) => {
      if (layout === 'portrait') await page.setViewportSize({ width: 480, height: 1000 });
      const shots: Buffer[] = [];
      for (let i = 0; i < 2; i++) {
        await startTest(page, id);
        expect(await page.evaluate(() => window.__tarpit!.layout())).toBe(layout);
        await frames(page, 4);
        shots.push(await page.screenshot());
      }
      expect(shots[0].equals(shots[1]), 'two loads').toBe(true);
      await page.waitForTimeout(3000);
      await frames(page, 4);
      expect((await page.screenshot()).equals(shots[1]), 'after 3 s').toBe(true);
      const d = await decor(page);
      expect(d.still).toBe(true);
      expect(d.t).toBe(0);
    });
  }
}

test('while placing, the growth fades; the fade ends by every route; the highlight on tree cells matches grass', async ({ page }) => {
  await startTest(page, 'riverbend');
  await gold(page);
  const d = await decor(page);
  const bar = async (name: string) => (await page.evaluate(() => window.__tarpit!.uiRects()))[name];
  const alpha = async () => { await frames(page, 3); return (await decor(page)).growthAlpha; };
  const mus = await bar('bar:musketeer');
  const clickBar = () => page.mouse.click(mus.x + mus.width / 2, mus.y + mus.height / 2);
  const tree = d.growth.find((g) => g.kind === 'tree')!;
  const free = { x: tree.col * 32 + 16, y: tree.row * 32 + 16 };

  // Pick, then Escape.
  expect(await alpha()).toBe(1);
  await clickBar();
  expect(await alpha()).toBe(0.3);
  await page.keyboard.press('Escape');
  expect(await alpha(), 'Escape').toBe(1);

  // Pick, click the bar again (toggle off).
  await clickBar();
  await clickBar();
  expect(await alpha(), 'toggle').toBe(1);

  // Pick, build on a tree: report whether the pick stays (the fade then stays by design).
  await clickBar();
  await page.mouse.click(free.x, free.y);
  const pickAfterBuild = (await page.evaluate(() => window.__tarpit!.ui!())).pick;
  const aAfterBuild = await alpha();
  console.log(`after a click-build the pick is ${pickAfterBuild}; growth alpha ${aAfterBuild}`);
  expect(aAfterBuild).toBe(pickAfterBuild === null ? 1 : 0.3);
  await page.keyboard.press('Escape');
  expect(await alpha()).toBe(1);
  await sell(page, tree);

  // Drag from the bar, over the map (active), release off the map (the HUD strip).
  await page.mouse.move(mus.x + mus.width / 2, mus.y + mus.height / 2);
  await page.mouse.down();
  await page.mouse.move(free.x, free.y, { steps: 6 });
  expect(await alpha(), 'mid-drag').toBe(0.3);
  await page.mouse.move(400, 505, { steps: 4 });
  await page.mouse.up();
  // As on main, a press on a bar button leaves its pick even when the drag is cancelled, so the fade follows the pick (placement not over).
  const pickAfterDrag = (await page.evaluate(() => window.__tarpit!.ui!())).pick;
  expect(await alpha(), 'released off the map').toBe(pickAfterDrag === null ? 1 : 0.3);
  await page.keyboard.press('Escape');
  expect(await alpha(), 'Escape after the drag').toBe(1);
  expect((await page.evaluate(() => window.__tarpit!.state!().towers)).length).toBe(0);

  // Gold running out: exactly the cost left, pick, build with a click.
  const cost0 = TOWER_DEFS.musketeer.cost;
  await page.evaluate((c) => { window.__tarpit!.state!().gold = c; }, cost0);
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as Scene).redraw());
  await clickBar();
  const a1 = await alpha();
  await page.mouse.click(free.x, free.y);
  const g1 = await page.evaluate(() => window.__tarpit!.state!().gold);
  const pk = (await page.evaluate(() => window.__tarpit!.ui!())).pick;
  const a2 = await alpha();
  console.log(`gold running out: placing alpha ${a1}; after build gold ${g1}, pick ${pk}, alpha ${a2}`);
  expect(a2, 'after the last gold is spent the pick is gone, so the fade ends').toBe(pk === null ? 1 : 0.3);
  await page.keyboard.press('Escape');
  await sell(page, tree);

  // A layout switch mid-drag.
  await gold(page);
  await page.mouse.move(mus.x + mus.width / 2, mus.y + mus.height / 2);
  await page.mouse.down();
  await page.mouse.move(free.x, free.y, { steps: 6 });
  expect(await alpha(), 'mid-drag').toBe(0.3);
  await page.setViewportSize({ width: 480, height: 1000 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
  expect(await alpha(), 'after the switch').toBe(1);
  await page.mouse.up();
  expect(await alpha(), 'after release').toBe(1);
  await page.setViewportSize({ width: 960, height: 580 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
  expect(await alpha()).toBe(1);

  // Highlight: for every tree and bush cell and for 25 plain cells, hover with a Musketeer picked; the outline is "ok" green and the cell changes.
  const pixels = (x: number, y: number) => page.evaluate(([x, y]) => {
    const dd = window.__tarpit!.game.canvas.getContext('2d')!.getImageData(x, y, 32, 32).data;
    return Array.from(dd);
  }, [x, y]);
  await startTest(page, 'riverbend');
  await gold(page);
  await clickBar();
  console.log('pick before highlight sweep', (await page.evaluate(() => window.__tarpit!.ui!())).pick);
  await page.mouse.move(700, 560); // off the map: pick active, no hover cell
  await frames(page, 3);
  const taken = new Set(d.growth.map((g) => `${g.col},${g.row}`));
  const plains: Cell[] = [];
  for (let row = 0; row < 15 && plains.length < 25; row++) for (let col = 0; col < 30; col += 3) {
    if (taken.has(`${col},${row}`) || plains.length >= 25) continue;
    if (isBuildableTerrain({ col, row }, MAPS.riverbend)) plains.push({ col, row });
  }
  const ok = rgb(COLORS.cellOk);
  const stat = async (c: Cell) => {
    const before = await pixels(c.col * 32, c.row * 32);
    await page.mouse.move(c.col * 32 + 16, c.row * 32 + 16);
    await frames(page, 2);
    const ui = await page.evaluate(() => window.__tarpit!.ui!());
    if (!ui.hoverCell || ui.hoverCell.col !== c.col || ui.hoverCell.row !== c.row) return null;
    const after = await pixels(c.col * 32, c.row * 32);
    let diff = 0;
    for (let i = 0; i < after.length; i += 4) diff += Math.abs(after[i] - before[i]) + Math.abs(after[i + 1] - before[i + 1]) + Math.abs(after[i + 2] - before[i + 2]);
    diff /= 1024 * 3;
    const px = (x: number, y: number) => [after[(y * 32 + x) * 4], after[(y * 32 + x) * 4 + 1], after[(y * 32 + x) * 4 + 2]];
    const edge = Math.max(...[px(0, 0), px(15, 0), px(31, 31), px(0, 16), px(31, 15), px(15, 31)].map((p) => Math.max(...p.map((v, k) => Math.abs(v - ok[k])))));
    await page.mouse.move(700, 560);
    return { diff, edge };
  };
  const treeStats: { diff: number; edge: number }[] = [];
  for (const g of d.growth) {
    const s = await stat(g);
    if (s) treeStats.push(s);
  }
  const plainStats: { diff: number; edge: number }[] = [];
  for (const c of plains) {
    const s = await stat(c);
    if (s) plainStats.push(s);
  }
  const m = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
  console.log(`highlight (Riverbend): growth cells n=${treeStats.length} mean change ${m(treeStats.map((s) => s.diff)).toFixed(1)} min ${Math.min(...treeStats.map((s) => s.diff)).toFixed(1)} worst outline error ${Math.max(...treeStats.map((s) => s.edge))}; grass cells n=${plainStats.length} mean change ${m(plainStats.map((s) => s.diff)).toFixed(1)} min ${Math.min(...plainStats.map((s) => s.diff)).toFixed(1)} worst outline error ${Math.max(...plainStats.map((s) => s.edge))}`);
  expect(treeStats.length).toBeGreaterThan(15);
  expect(plainStats.length).toBeGreaterThan(8);
  // (the sampled outline pixels include corners the range circle covers, so the same worst error shows on plain grass: compare, do not pin)
  expect(Math.max(...treeStats.map((s) => s.edge))).toBeLessThanOrEqual(Math.max(...plainStats.map((s) => s.edge)) + 10);
  expect(Math.min(...treeStats.map((s) => s.diff))).toBeGreaterThan(Math.min(...plainStats.map((s) => s.diff)) * 0.7);
});

test('decoration never takes input: no object is interactive; clicks and drags on tree, flower and stone cells reach the game', async ({ page }) => {
  await startTest(page, 'meadow');
  await gold(page);
  const interactive = await page.evaluate(() => {
    const s = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
    const L = s.living;
    const objs = [L.ground, L.water, L.low, L.air, ...L.growth.map((v: Scene) => v.top), s.town.layer, ...L.clouds].filter(Boolean);
    return objs.filter((o: Scene) => o.input).length;
  });
  expect(interactive).toBe(0);
  const dec = decorFor(MAPS.meadow);
  const taken = new Set(dec.growth.map((g) => `${g.cell.col},${g.cell.row}`));
  const cellOf = (p: { x: number; y: number }) => ({ col: Math.floor(p.x / 32), row: Math.floor(p.y / 32) });
  const buildable = async (c: Cell) => page.evaluate(([col, row]) => { const ok = window.__tarpit!.buildAt!(col, row, 'musketeer').ok; if (ok) window.__tarpit!.sellAt!(col, row); return ok; }, [c.col, c.row]);
  const seen = new Set<string>();
  const targets: { what: string; cell: Cell }[] = [];
  for (const g of dec.growth.slice(0, 4)) targets.push({ what: g.kind, cell: g.cell });
  for (const f of dec.flowers) { const c = cellOf(f); const k = `${c.col},${c.row}`; if (!seen.has(k) && !taken.has(k) && (await buildable(c)) && targets.filter((t) => t.what === 'flower').length < 4) { seen.add(k); targets.push({ what: 'flower', cell: c }); } }
  for (const f of dec.stones) { const c = cellOf(f); const k = `${c.col},${c.row}`; if (!seen.has(k) && !taken.has(k) && (await buildable(c)) && targets.filter((t) => t.what === 'stone').length < 4) { seen.add(k); targets.push({ what: 'stone', cell: c }); } }
  expect(targets.filter((t) => t.what === 'stone').length).toBeGreaterThan(0);
  expect(targets.filter((t) => t.what === 'flower').length).toBeGreaterThan(0);
  const bar = (await page.evaluate(() => window.__tarpit!.uiRects()))['bar:musketeer'];
  const bx = bar.x + bar.width / 2;
  const by = bar.y + bar.height / 2;
  for (const t of targets) {
    const x = t.cell.col * 32 + 16;
    const y = t.cell.row * 32 + 16;
    // Click route.
    await page.mouse.click(bx, by);
    await page.mouse.click(x, y);
    expect(await page.evaluate(([c, r]) => window.__tarpit!.state!().towers.some((q) => q.cell.col === c && q.cell.row === r), [t.cell.col, t.cell.row]), `click on ${t.what} cell`).toBe(true);
    await page.keyboard.press('Escape');
    await sell(page, t.cell);
    // Drag route.
    await page.mouse.move(bx, by);
    await page.mouse.down();
    await page.mouse.move(x, y, { steps: 8 });
    await page.mouse.up();
    expect(await page.evaluate(([c, r]) => window.__tarpit!.state!().towers.some((q) => q.cell.col === c && q.cell.row === r), [t.cell.col, t.cell.row]), `drag onto ${t.what} cell`).toBe(true);
    await page.keyboard.press('Escape');
    await sell(page, t.cell);
  }
});

test.describe('reduced motion and real mode: what moves', () => {
  const region = { x: 0, y: 0, width: 960, height: 480 };
  test('real mode: the map changes between frames; reduced motion: it does not', async ({ browser }) => {
    const results: Record<string, boolean> = {};
    for (const reduced of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: 960, height: 580 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
      const page = await ctx.newPage();
      await page.goto('/?look=classic');
      await waitForTitle(page);
      await page.evaluate(() => (window.__tarpit!.game.scene.getScene('title') as unknown as { play(d: string, m: string): void }).play('normal', 'riverbend'));
      await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
      await page.waitForTimeout(700);
      const a = await page.screenshot({ clip: region });
      await page.waitForTimeout(1500);
      const b = await page.screenshot({ clip: region });
      results[reduced ? 'reduced' : 'real'] = a.equals(b);
      await ctx.close();
    }
    console.log(`identical map frames 1.5 s apart: real=${results.real} reduced=${results.reduced}`);
    expect(results.real).toBe(false);
    expect(results.reduced).toBe(true);
  });
});

test('leaks: ten layout switches, five Play agains and three map changes do not grow textures, objects or listeners', async ({ page }) => {
  await startTest(page, 'meadow', true);
  const snap = () =>
    page.evaluate(() => {
      const g = window.__tarpit!.game;
      const s = g.scene.getScene('game') as unknown as Scene;
      const count = (e: Scene) => e.eventNames().reduce((n: number, k: string | symbol) => n + e.listenerCount(k), 0);
      return {
        keys: g.textures.getTextureKeys().filter((k: string) => !/^[0-9a-f]{8}-/.test(k)).sort(),
        anon: g.textures.getTextureKeys().filter((k: string) => /^[0-9a-f]{8}-/.test(k)).length,
        objects: s.children.length as number,
        sceneEvents: count(s.events) + count(s.input) + count(s.scale) + (s.input.keyboard ? count(s.input.keyboard) : 0),
        gameEvents: count(g.events) + count(g.scale),
        dom: (window as unknown as { __lc: number }).__lc,
        mapId: window.__tarpit!.decor()!.mapId,
      };
    });
  const base = await snap();
  for (let i = 0; i < 10; i++) {
    await page.setViewportSize(i % 2 === 0 ? { width: 480, height: 1000 } : { width: 960, height: 580 });
    await page.waitForFunction((p) => window.__tarpit!.layout() === p, i % 2 === 0 ? 'portrait' : 'landscape');
    await frames(page, 3);
  }
  // Ten switches end in landscape.
  const afterSwitch = await snap();
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as Scene).playAgain());
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
    await frames(page, 3);
  }
  const afterAgain = await snap();
  console.log(`baseline textures ${base.keys.length}+${base.anon} anon objects ${base.objects} scene listeners ${base.sceneEvents} game listeners ${base.gameEvents} dom ${base.dom}`);
  console.log(`after 10 switches: ${afterSwitch.keys.length} ${afterSwitch.objects} ${afterSwitch.sceneEvents} ${afterSwitch.gameEvents} ${afterSwitch.dom}; after 5 Play agains: ${afterAgain.keys.length} ${afterAgain.objects} ${afterAgain.sceneEvents} ${afterAgain.gameEvents} ${afterAgain.dom}`);
  for (const s of [afterSwitch, afterAgain]) {
    expect(s.keys).toEqual(base.keys);
    expect(s.anon).toBe(base.anon);
    expect(s.objects).toBe(base.objects);
    expect(s.sceneEvents).toBeLessThanOrEqual(base.sceneEvents);
    expect(s.gameEvents).toBeLessThanOrEqual(base.gameEvents);
    expect(s.dom).toBeLessThanOrEqual(base.dom + 0);
  }
  // Three map changes through the menu: meadow -> switchback -> riverbend -> meadow.
  const perMap: Record<string, Awaited<ReturnType<typeof snap>>> = {};
  for (const m of ['switchback', 'riverbend', 'meadow'] as const) {
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as Scene).toMenu());
    await waitForTitle(page);
    await page.evaluate((mm) => (window.__tarpit!.game.scene.getScene('title') as unknown as { play(d: string, m: string): void }).play('normal', mm), m);
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
    await frames(page, 3);
    perMap[m] = await snap();
    expect(perMap[m].mapId).toBe(m);
  }
  console.log(`after map changes: textures ${perMap.switchback.keys.length}/${perMap.riverbend.keys.length}/${perMap.meadow.keys.length}, objects ${perMap.switchback.objects}/${perMap.riverbend.objects}/${perMap.meadow.objects}, dom ${perMap.switchback.dom}/${perMap.riverbend.dom}/${perMap.meadow.dom}`);
  // Back on meadow: the same key set as the start (the old maps' cached images are gone) and no growth in objects or listeners.
  expect(perMap.meadow.keys).toEqual(base.keys);
  expect(perMap.meadow.anon).toBe(base.anon);
  expect(perMap.switchback.anon).toBe(base.anon);
  expect(perMap.riverbend.anon).toBe(base.anon);
  expect(perMap.meadow.objects).toBe(base.objects);
  expect(perMap.meadow.sceneEvents).toBeLessThanOrEqual(base.sceneEvents);
  expect(perMap.meadow.dom).toBeLessThanOrEqual(base.dom + 2);
  expect(perMap.switchback.keys.length).toBeLessThanOrEqual(base.keys.length + 1);
});

function edge0(growth: { x: number; y: number; r: number }[], dist: (x: number, y: number) => number): number {
  return Math.min(...growth.map((g) => dist(g.x, g.y) - g.r));
}
