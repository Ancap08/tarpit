import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { decorFor } from '../src/game/decor/recipe';
import { PLACING_ALPHA } from '../src/game/decor/livingMap';
import { COLORS } from '../src/game/palette';
import { isBuildableTerrain } from '../src/sim/grid';
import { MAP_IDS, MAPS, type MapId } from '../src/sim/map';
import { waitForTitle } from './title';

// Milestone 34 (a living map), desktop project (960 x 580: canvas px are page px).
// The decoration list and the hide-when-built rule through window.__tarpit.decor(),
// the placement highlight over a tree, still and identical test-mode frames,
// moving things in play and none under reduced motion, and no growth in
// textures or objects across layout switches and Play again.

type Cell = { col: number; row: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const decor = (page: Page) => page.evaluate(() => window.__tarpit!.decor()!);
const frames = (page: Page, n = 2) =>
  page.evaluate((k) => new Promise((r) => {
    let left = k;
    const f = () => (--left <= 0 ? r(null) : requestAnimationFrame(f));
    requestAnimationFrame(f);
  }), n);

async function startTest(page: Page, map: MapId = 'meadow'): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await page.evaluate((m) => (window.__tarpit as TarpitTestApi).startGame('normal', m), map);
  await frames(page);
}

/** Start a game in play (real time) by clicking Play on the title. */
async function startPlay(page: Page, map: MapId = 'meadow'): Promise<void> {
  await page.goto('/?look=classic');
  await waitForTitle(page);
  await page.evaluate((m) => {
    const title = window.__tarpit!.game.scene.getScene('title') as unknown as { play(d: string, m: string): void };
    title.play('normal', m);
  }, map);
  await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
}

/** Mean RGB of the canvas square (x, y, w, h), read from the 2D canvas (test mode renders with Canvas). */
const pixels = (page: Page, x: number, y: number, w: number, h: number) =>
  page.evaluate(
    ([x, y, w, h]) => {
      const c = window.__tarpit!.game.canvas;
      const d = c.getContext('2d')!.getImageData(x, y, w, h).data;
      const out: number[][] = [];
      for (let i = 0; i < d.length; i += 4) out.push([d[i], d[i + 1], d[i + 2]]);
      return out;
    },
    [x, y, w, h],
  );
const mean = (px: number[][]) => [0, 1, 2].map((k) => px.reduce((s, p) => s + p[k], 0) / px.length);
const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

for (const id of MAP_IDS) {
  test(`${id}: the decoration list is the recipe's, the same on every load`, async ({ page }) => {
    await startTest(page, id);
    const d = await decor(page);
    const want = decorFor(MAPS[id]).growth.map((g) => ({ id: g.id, kind: g.kind, col: g.cell.col, row: g.cell.row, x: g.x, y: g.y }));
    expect(d.mapId).toBe(id);
    expect(d.growth).toEqual(want);
    expect(d.hidden).toEqual([]);
    expect(d.still).toBe(true);
    expect(d.moving.bird).toBeNull();
    expect(d.moving.butterfly).toBeNull();
  });
}

test('building on a tree or bush hides it; selling and a planning-phase move bring it back', async ({ page }) => {
  await startTest(page, 'meadow');
  const d = await decor(page);
  const tree = d.growth.find((g) => g.kind === 'tree')!;
  const bush = d.growth.find((g) => g.kind === 'bush')!;
  await api(page, (a) => {
    a.state().gold = 10000;
  });
  const build = (c: Cell) => page.evaluate(([col, row]) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, [c.col, c.row]);
  const sell = (c: Cell) => page.evaluate(([col, row]) => window.__tarpit!.sellAt!(col, row).ok, [c.col, c.row]);
  const move = (a: Cell, b: Cell) => page.evaluate(([ac, ar, bc, br]) => window.__tarpit!.moveAt!(ac, ar, bc, br).ok, [a.col, a.row, b.col, b.row]);

  expect(await build(tree)).toBe(true);
  expect((await decor(page)).hidden).toEqual([tree.id]);
  expect(await build(bush)).toBe(true);
  expect((await decor(page)).hidden).toEqual([tree.id, bush.id].sort((a, b) => a - b));
  expect(await sell(tree)).toBe(true);
  expect((await decor(page)).hidden).toEqual([bush.id]);
  // Move the bush's tower onto the tree's cell (setup: the tower is unlocked): the bush returns, the tree hides.
  expect(await move(bush, tree)).toBe(true);
  expect((await decor(page)).hidden).toEqual([tree.id]);
  // And away to a plain buildable cell with nothing growing.
  const taken = new Set(d.growth.map((g) => `${g.col},${g.row}`));
  const free = await page.evaluate((busy) => {
    const t = window.__tarpit!;
    for (let row = 0; row < 15; row++)
      for (let col = 0; col < 30; col++) {
        if (busy.includes(`${col},${row}`)) continue;
        if (t.buildAt!(col, row, 'musketeer').ok) {
          t.sellAt!(col, row);
          return { col, row };
        }
      }
    return null;
  }, [...taken]);
  expect(free).not.toBeNull();
  expect(await move(tree, free!)).toBe(true);
  expect((await decor(page)).hidden).toEqual([]);
});

test('the placement highlight reads over a tree cell: the trees fade, the outline is green and the cell looks like grass', async ({ page }) => {
  await startTest(page, 'riverbend');
  const d = await decor(page);
  const tree = d.growth.find((g) => g.kind === 'tree')!;
  const x = tree.col * 32;
  const y = tree.row * 32;
  const before = await pixels(page, x, y, 32, 32);
  // Pick a Musketeer and hover the tree's cell.
  const r = (await api(page, (a) => a.uiRects()))['bar:musketeer'];
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.move(x + 16, y + 16);
  await frames(page);
  expect((await decor(page)).growthAlpha).toBe(PLACING_ALPHA);
  expect((await api(page, (a) => a.ui())).hoverCell).toEqual({ col: tree.col, row: tree.row });
  const after = await pixels(page, x, y, 32, 32);
  // The cell changed a lot, and its outline (2 px, under only the range circle's faint fill) is the "ok" green.
  const diff = mean(after.map((p, i) => p.map((v, k) => Math.abs(v - before[i][k])))).reduce((s, v) => s + v, 0);
  expect(diff).toBeGreaterThan(40);
  const ok = rgb(COLORS.cellOk);
  const edge = [after[0], after[15], after[31], after[32 * 16], after[32 * 31 + 15]];
  for (const p of edge) expect(Math.max(...p.map((v, k) => Math.abs(v - ok[k]))), `edge ${p}`).toBeLessThanOrEqual(25);
  // The hovered tree cell looks like a hovered plain grass cell (the cell beside it with nothing growing): a buildable cell never looks blocked.
  const taken = new Set(d.growth.map((g) => `${g.col},${g.row}`));
  const plain = [-1, 1, -2, 2, 3, -3]
    .flatMap((dc) => [-1, 0, 1].map((dr) => ({ col: tree.col + dc, row: tree.row + dr })))
    .find((c) => !taken.has(`${c.col},${c.row}`) && isBuildableTerrain(c, MAPS.riverbend))!;
  expect(plain).toBeTruthy();
  await page.mouse.move(plain.col * 32 + 16, plain.row * 32 + 16);
  await frames(page);
  expect((await api(page, (a) => a.ui())).hoverCell).toEqual(plain);
  const grass = mean(await pixels(page, plain.col * 32, plain.row * 32, 32, 32));
  const overTree = mean(after);
  console.log(`highlight: tree cell ${overTree.map(Math.round)}, grass cell ${grass.map(Math.round)}, change from no highlight ${Math.round(diff)}`);
  for (let k = 0; k < 3; k++) expect(Math.abs(overTree[k] - grass[k]), `tree cell ${overTree} against grass cell ${grass}`).toBeLessThanOrEqual(20);
  // Unpicking brings the trees back to full opacity.
  await page.keyboard.press('Escape');
  await frames(page);
  expect((await decor(page)).growthAlpha).toBe(1);
});

test('test mode: two loads give byte-identical map frames', async ({ page }) => {
  const shots: Buffer[] = [];
  for (let i = 0; i < 2; i++) {
    await startTest(page, 'riverbend');
    await api(page, (a) => a.step(120));
    await frames(page, 3);
    shots.push(await page.screenshot({ clip: { x: 0, y: 0, width: 960, height: 480 } }));
  }
  expect(shots[0].equals(shots[1])).toBe(true);
});

test.describe('in play', () => {
  test('the moving things move: clouds, smoke, water, sway; a puff when a tree is built on', async ({ page }) => {
    await startPlay(page, 'riverbend');
    const a = await decor(page);
    await page.waitForTimeout(1200);
    const b = await decor(page);
    expect(a.still).toBe(false);
    expect(b.t).toBeGreaterThan(a.t + 500);
    expect(b.moving.clouds[0].x).not.toBe(a.moving.clouds[0].x);
    expect(b.moving.smoke).not.toEqual(a.moving.smoke);
    expect(b.moving.flow).not.toEqual(a.moving.flow);
    // Clouds drift slowly: a few px a second.
    expect(Math.abs(b.moving.clouds[0].x - a.moving.clouds[0].x)).toBeLessThan(20);
    const tree = b.growth.find((g) => g.kind === 'tree')!;
    const built = await page.evaluate(([col, row]) => {
      const s = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { gold: number }; build(c: { col: number; row: number }, t: string): { ok: boolean } };
      s.state.gold = 1000;
      return s.build({ col, row }, 'musketeer').ok;
    }, [tree.col, tree.row]);
    expect(built).toBe(true);
    const c = await decor(page);
    expect(c.hidden).toEqual([tree.id]);
    expect(c.puffs).toBe(1);
    await page.waitForTimeout(700);
    expect((await decor(page)).puffs).toBe(0);
  });
});

test.describe('under reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });
  test('nothing drifts, sways or flies; water and smoke hold still', async ({ page }) => {
    await startPlay(page, 'riverbend');
    const a = await decor(page);
    await page.waitForTimeout(1200);
    const b = await decor(page);
    expect(a.still).toBe(true);
    expect(b.t).toBe(0);
    expect(b.moving).toEqual(a.moving);
    expect(b.moving.bird).toBeNull();
    expect(b.moving.butterfly).toBeNull();
  });
});

test('five layout switches and three Play agains: texture and object counts do not grow', async ({ page }) => {
  await startTest(page, 'riverbend');
  const count = () =>
    page.evaluate(() => {
      const g = window.__tarpit!.game;
      const s = g.scene.getScene('game') as unknown as { children: { length: number } };
      return { textures: g.textures.getTextureKeys().length, objects: s.children.length };
    });
  const base = await count();
  const seen: { textures: number; objects: number }[] = [];
  for (let i = 0; i < 5; i++) {
    await page.setViewportSize({ width: 480, height: 1000 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
    await frames(page, 4);
    await page.setViewportSize({ width: 960, height: 580 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await frames(page, 4);
    seen.push(await count());
  }
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { playAgain(): void }).playAgain());
    await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.decor() !== null);
    await frames(page, 4);
    seen.push(await count());
  }
  for (const s of seen) expect(s).toEqual(base);
  expect((await decor(page)).growth.length).toBeGreaterThan(0);
});
