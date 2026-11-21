// Milestone 8 verifier: the ten legacy spot cells recomputed without the
// grid helpers.
import { describe, expect, it } from 'vitest';
import { buildableCells, MAP, type Point } from '../sim';
import { LEGACY_SPOT_CELLS, V1_SPOT_POSITIONS } from './legacySpots';

function pd(p: Point): number {
  let best = Infinity;
  for (let i = 0; i + 1 < MAP.path.length; i++) {
    const a = MAP.path[i];
    const b = MAP.path[i + 1];
    const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
    best = Math.min(best, Math.hypot(p.x - a.x - t * (b.x - a.x), p.y - a.y - t * (b.y - a.y)));
  }
  return best;
}

describe('legacy spot to cell mapping (independent)', () => {
  it('matches LEGACY_SPOT_CELLS; ties compared with a 1e-9 tolerance', () => {
    const mask = buildableCells(MAP);
    const mine = V1_SPOT_POSITIONS.map((spot) => {
      const own = pd(spot);
      const cands = [...Array(450).keys()]
        .filter((k) => mask[k])
        .map((k) => {
          const c = { x: (k % 30) * 32 + 16, y: Math.floor(k / 30) * 32 + 16 };
          return { k, d: Math.hypot(c.x - spot.x, c.y - spot.y), m: Math.abs(pd(c) - own) };
        });
      const dmin = Math.min(...cands.map((c) => c.d));
      const tied = cands.filter((c) => c.d - dmin < 1e-9);
      const mmin = Math.min(...tied.map((c) => c.m));
      return Math.min(...tied.filter((c) => c.m - mmin < 1e-9).map((c) => c.k));
    });
    expect(mine).toEqual(LEGACY_SPOT_CELLS.map((c) => c.row * 30 + c.col));
  });
});
