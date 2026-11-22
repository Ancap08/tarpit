import { expect, test } from '@playwright/test';
import { decorFor } from '../src/game/decor/recipe';
import { PLACING_ALPHA } from '../src/game/decor/livingMap';
import { COLORS } from '../src/game/palette';
import { MAP_IDS, MAPS } from '../src/sim/map';
import { startGame, tap, tapCell } from './phone';

// Milestone 34 (a living map) in portrait (phone project): the map turned
// carries the same decoration list as landscape (the recipe is defined in
// world space), building on a tree hides it, and a tapped tree cell shows
// the green highlight over faded trees.

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];

for (const id of MAP_IDS) {
  test(`${id}: portrait shows the same decoration list as the recipe (and landscape)`, async ({ page }) => {
    await startGame(page, 'normal', id);
    expect(await page.evaluate(() => window.__tarpit!.layout())).toBe('portrait');
    const d = await page.evaluate(() => window.__tarpit!.decor()!);
    expect(d.growth).toEqual(decorFor(MAPS[id]).growth.map((g) => ({ id: g.id, kind: g.kind, col: g.cell.col, row: g.cell.row, x: g.x, y: g.y })));
  });
}

test('a tapped tree cell shows the green highlight; building there hides the tree, selling brings it back', async ({ page }) => {
  await startGame(page, 'normal', 'meadow');
  const d = await page.evaluate(() => window.__tarpit!.decor()!);
  const tree = d.growth.find((g) => g.kind === 'tree')!;
  await tap(page, 'bar:musketeer');
  await tapCell(page, tree);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))));
  expect((await page.evaluate(() => window.__tarpit!.decor()!)).growthAlpha).toBe(PLACING_ALPHA);
  // The cell's outline on the canvas (portrait: the cell's screen square from the layout) is the "ok" green (under only the range circle's faint fill).
  const edge = await page.evaluate(
    ([col, row]) => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as unknown as { layout: { cellRect(c: { col: number; row: number }): { x: number; y: number } } };
      const r = scene.layout.cellRect({ col, row });
      const d = t.game.canvas.getContext('2d')!.getImageData(Math.round(r.x), Math.round(r.y), 32, 32).data;
      const at = (x: number, y: number) => [d[(y * 32 + x) * 4], d[(y * 32 + x) * 4 + 1], d[(y * 32 + x) * 4 + 2]];
      return [at(0, 0), at(15, 0), at(31, 31), at(0, 16)];
    },
    [tree.col, tree.row],
  );
  for (const p of edge) expect(Math.max(...p.map((v, k) => Math.abs(v - rgb(COLORS.cellOk)[k]))), `edge ${p}`).toBeLessThanOrEqual(25);
  await tapCell(page, tree);
  expect((await page.evaluate(() => window.__tarpit!.decor()!)).hidden).toEqual([tree.id]);
  await page.evaluate(([c, r]) => window.__tarpit!.sellAt!(c, r), [tree.col, tree.row]);
  expect((await page.evaluate(() => window.__tarpit!.decor()!)).hidden).toEqual([]);
});
