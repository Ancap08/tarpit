import { describe, expect, it } from 'vitest';
import { CELL, cellCenter, GRID_COLS, GRID_ROWS, isBuildableTerrain, MAP_IDS, MAPS, type Cell, type Point, type Rect } from '../sim';
import { LANDSCAPE, PORTRAIT } from './layout';
import { snapCell } from './touchAssist';

// Milestone 35 verifier: an independent computation of the snap rule (written from the scope and
// DESIGN text, not from touchAssist.ts) over every unbuildable cell of every map, 49 lifted points in
// each, in both layouts, compared with snapCell.

/** Parametric segment intersection strictly inside both segments. */
function crossesLine(p: Point, q: Point, a: Point, b: Point): boolean {
  const r = { x: q.x - p.x, y: q.y - p.y };
  const s = { x: b.x - a.x, y: b.y - a.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return false;
  const t = ((a.x - p.x) * s.y - (a.y - p.y) * s.x) / den;
  const u = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / den;
  return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
}

const strictlyIn = (p: Point, r: Rect) => p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;

/** Barrier by dense sampling of the segment (an implementation unlike the game's clipping). */
function blocked(p: Point, q: Point, map: (typeof MAPS)[keyof typeof MAPS]): boolean {
  for (let i = 1; i < map.path.length; i++) if (crossesLine(p, q, map.path[i - 1], map.path[i])) return true;
  const boxes = [...(map.water ?? []), ...(map.landmarks ?? [])];
  for (const r of boxes) {
    if (strictlyIn(p, r)) continue;
    for (let k = 1; k < 400; k++) {
      const t = k / 400;
      if (strictlyIn({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }, r)) return true;
    }
  }
  return false;
}

describe('snap rule, independent computation', () => {
  const stats: string[] = [];
  for (const [layoutName, layout] of [['landscape', LANDSCAPE], ['portrait', PORTRAIT]] as const) {
    const down = { x: -layout.up.x, y: -layout.up.y };
    for (const id of MAP_IDS) {
      it(`${id} in ${layoutName}: same choice as snapCell, no crossings`, () => {
        const map = MAPS[id];
        const ok = (c: Cell) => isBuildableTerrain(c, map);
        let total = 0;
        let mismatches = 0;
        let crossings = 0;
        let redNow = 0;
        let snappedBefore = 0;
        for (let row = 0; row < GRID_ROWS; row++) {
          for (let col = 0; col < GRID_COLS; col++) {
            if (ok({ col, row })) continue;
            const c0 = cellCenter({ col, row });
            for (const fx of [-15, -8, -1, 0, 1, 8, 15]) {
              for (const fy of [-15, -8, -1, 0, 1, 8, 15]) {
                const p = { x: c0.x + fx + 0.013, y: c0.y + fy + 0.017 };
                // the old rule: nearest of the eight neighbours, no barrier
                let old = false;
                // the new rule, independently
                let best: Cell | null = null;
                let bestScore = Infinity;
                let bestFinger = false;
                for (let dr = -1; dr <= 1; dr++) {
                  for (let dc = -1; dc <= 1; dc++) {
                    if (dr === 0 && dc === 0) continue;
                    const n = { col: col + dc, row: row + dr };
                    if (n.col < 0 || n.row < 0 || n.col >= GRID_COLS || n.row >= GRID_ROWS || !ok(n)) continue;
                    old = true;
                    const q = cellCenter(n);
                    if (blocked(p, q, map)) continue;
                    const dx = q.x - p.x;
                    const dy = q.y - p.y;
                    const finger = dx * down.x + dy * down.y > 1e-9;
                    const score = Math.hypot(dx, dy) * (finger ? 1.25 : 1);
                    const better = score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && ((bestFinger && !finger) || (bestFinger === finger && best !== null && (n.row < best.row || (n.row === best.row && n.col < best.col)))));
                    if (best === null || better) {
                      best = n;
                      bestScore = score;
                      bestFinger = finger;
                    }
                  }
                }
                const got = snapCell({ col, row }, p, ok, { map, down });
                total++;
                if (old && got === null) redNow++;
                if (old) snappedBefore++;
                if ((got === null) !== (best === null) || (got && best && (got.col !== best.col || got.row !== best.row))) mismatches++;
                if (got && blocked(p, cellCenter(got), map)) crossings++;
              }
            }
          }
        }
        stats.push(`${id} ${layoutName}: ${total} points, ${mismatches} mismatches, ${crossings} crossings, red where the old rule snapped ${redNow} of ${snappedBefore} (${((100 * redNow) / snappedBefore).toFixed(1)}% of old snaps)`);
        console.log(stats[stats.length - 1]);
        expect(mismatches).toBe(0);
        expect(crossings).toBe(0);
      });
    }
  }
  void CELL;
});
