// Milestone 34: the map decoration recipe (decor/recipe.ts) and the moving things' maths (decor/motion.ts).

import { describe, expect, it } from 'vitest';
import { CELL, cellCenter, cellKey, distanceToPath, GRID_COLS, GRID_ROWS, isBuildableTerrain, MAP_IDS, MAPS, terrainBlock, type Rect } from '../../sim';
import { birdAt, blinking, butterflyAt, cloudAt, flowLine, glint, MOTION_COUNTS, smokePuff, STILL_T, sway } from './motion';
import { BUSH_RANGE, canGrow, DECOR_KEEP_OUT, decorFor, GROWTH_TRAIL_CLEARANCE, hiddenGrowth, TREE_RANGE } from './recipe';

const inside = (x: number, y: number, r: Rect) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

describe('decorFor', () => {
  for (const id of MAP_IDS) {
    const map = MAPS[id];
    describe(id, () => {
      const d = decorFor(map);

      it('gives the same list for the same map (a fresh copy of the map too)', () => {
        expect(decorFor(map)).toEqual(d);
        expect(decorFor({ ...map, path: map.path.map((p) => ({ ...p })) })).toEqual(d);
      });

      it('has 8 to 14 trees and 8 to 14 bushes', () => {
        const trees = d.growth.filter((g) => g.kind === 'tree').length;
        const bushes = d.growth.filter((g) => g.kind === 'bush').length;
        expect(trees).toBeGreaterThanOrEqual(TREE_RANGE.min);
        expect(trees).toBeLessThanOrEqual(TREE_RANGE.max);
        expect(bushes).toBeGreaterThanOrEqual(BUSH_RANGE.min);
        expect(bushes).toBeLessThanOrEqual(BUSH_RANGE.max);
      });

      it('grows only on buildable cells inside the map, two cells from the trail, off the water, the cottage and the keep-out boxes', () => {
        for (const g of d.growth) {
          expect(g.cell.col).toBeGreaterThanOrEqual(0);
          expect(g.cell.col).toBeLessThan(GRID_COLS);
          expect(g.cell.row).toBeGreaterThanOrEqual(0);
          expect(g.cell.row).toBeLessThan(GRID_ROWS);
          expect(isBuildableTerrain(g.cell, map)).toBe(true);
          expect(terrainBlock(g.cell, map)).toBeUndefined();
          expect(distanceToPath(cellCenter(g.cell), map)).toBeGreaterThanOrEqual(GROWTH_TRAIL_CLEARANCE);
          // The canopy too: its nearest edge stays clear of the trail strip, and the drawn centre stays in its cell.
          expect(distanceToPath(g, map) - g.r).toBeGreaterThan(20 + 20);
          expect(Math.abs(g.x - cellCenter(g.cell).x)).toBeLessThanOrEqual(3);
          expect(Math.abs(g.y - cellCenter(g.cell).y)).toBeLessThanOrEqual(3);
          for (const box of [...(map.water ?? []), ...(map.landmarks ?? [])]) {
            const grown = { x: box.x - CELL, y: box.y - CELL, width: box.width + 2 * CELL, height: box.height + 2 * CELL };
            expect(inside(g.x, g.y, grown)).toBe(false);
          }
          for (const r of DECOR_KEEP_OUT) {
            const x = g.cell.col * CELL;
            const y = g.cell.row * CELL;
            expect(x < r.x + r.width && r.x < x + CELL && y < r.y + r.height && r.y < y + CELL).toBe(false);
          }
        }
      });

      it('records one growth per cell with stable ids', () => {
        const keys = d.growth.map((g) => cellKey(g.cell));
        expect(new Set(keys).size).toBe(keys.length);
        d.growth.forEach((g, i) => expect(g.id).toBe(i));
      });

      it('hides exactly the growths whose cell holds a tower', () => {
        const tree = d.growth.find((g) => g.kind === 'tree')!;
        const bush = d.growth.find((g) => g.kind === 'bush')!;
        expect(hiddenGrowth(d.growth, [])).toEqual([]);
        expect(hiddenGrowth(d.growth, [tree.cell, { col: tree.cell.col + 40, row: 0 }])).toEqual([tree.id]);
        expect(hiddenGrowth(d.growth, [bush.cell, tree.cell]).sort()).toEqual([tree.id, bush.id].sort());
      });

      it('keeps grass details off the trail strip and the water, and trail details on the strip', () => {
        for (const p of [...d.flowers, ...d.stones, ...d.tufts, ...d.swayTufts]) {
          expect(distanceToPath(p, map)).toBeGreaterThan(24);
          for (const w of map.water ?? []) expect(inside(p.x, p.y, w)).toBe(false);
        }
        for (const p of [...d.pebbles, ...d.trailSpots]) expect(distanceToPath(p, map)).toBeLessThanOrEqual(16);
        for (const r of d.ruts) {
          expect(distanceToPath(r.a, map)).toBeLessThanOrEqual(8.001);
          expect(distanceToPath(r.b, map)).toBeLessThanOrEqual(8.001);
        }
        for (const b of d.flowerBeds) expect(distanceToPath(b, map)).toBeGreaterThanOrEqual(GROWTH_TRAIL_CLEARANCE);
        expect(d.flowers.length).toBeGreaterThan(20);
        expect(d.patches.length).toBeGreaterThan(30);
        expect(d.ruts.length).toBeGreaterThan(20);
      });
    });
  }

  it('differs between maps', () => {
    expect(decorFor(MAPS.meadow).patches).not.toEqual(decorFor(MAPS.switchback).patches);
  });

  it('never grows on a cell canGrow refuses', () => {
    for (const id of MAP_IDS) for (const g of decorFor(MAPS[id]).growth) expect(canGrow(g.cell, MAPS[id])).toBe(true);
  });
});

describe('motion', () => {
  const map = MAPS.riverbend;
  const river = map.water![0];

  it('is still at t = 0 the same way every time: no bird, no butterfly, eyes open', () => {
    expect(birdAt(map, STILL_T)).toBeNull();
    expect(butterflyAt(map, decorFor(map).flowerBeds, STILL_T)).toBeNull();
    expect(blinking(STILL_T)).toBe(false);
    expect(cloudAt(map, 1, STILL_T)).toEqual(cloudAt(map, 1, STILL_T));
  });

  it('sways by at most 1.5 px in half-pixel steps', () => {
    for (let t = 0; t < 8000; t += 37) {
      const s = sway(t, 1.2);
      expect(Math.abs(s)).toBeLessThanOrEqual(1.5);
      expect(s * 2).toBe(Math.round(s * 2));
    }
  });

  it('moves clouds slowly and keeps the flow lines and glints inside the river', () => {
    const a = cloudAt(map, 0, 0);
    const b = cloudAt(map, 0, 1000);
    expect(b.x - a.x).toBeGreaterThan(0);
    expect(b.x - a.x).toBeLessThan(10);
    for (let t = 0; t < 20000; t += 250) {
      for (let i = 0; i < MOTION_COUNTS.flowLines; i++) {
        const f = flowLine(river, i, t);
        expect(inside(f.x, f.y, river)).toBe(true);
        expect(inside(f.x, f.y + f.len, river)).toBe(true);
      }
      for (let i = 0; i < MOTION_COUNTS.glints; i++) {
        const g = glint(map, river, i, t);
        if (g) expect(inside(g.x, g.y, river)).toBe(true);
      }
    }
    expect(flowLine(river, 0, 1000).y).not.toBe(flowLine(river, 0, 0).y);
  });

  it('shows a bird and a butterfly now and then, the butterfly two cells from the trail', () => {
    const beds = decorFor(map).flowerBeds;
    let birds = 0;
    let flies = 0;
    for (let t = 0; t < 120000; t += 100) {
      if (birdAt(map, t)) birds++;
      const f = butterflyAt(map, beds, t);
      if (f) {
        flies++;
        expect(distanceToPath(f, map)).toBeGreaterThan(GROWTH_TRAIL_CLEARANCE - 20);
      }
    }
    // Rare: each is on screen well under half the time.
    expect(birds).toBeGreaterThan(0);
    expect(birds).toBeLessThan(400);
    expect(flies).toBeGreaterThan(0);
    expect(flies).toBeLessThan(600);
  });

  it('puffs smoke that rises and fades', () => {
    const early = smokePuff(0, 300);
    const late = smokePuff(0, 4500);
    expect(late.dy).toBeLessThan(early.dy);
    expect(late.alpha).toBeLessThan(0.1);
  });
});
