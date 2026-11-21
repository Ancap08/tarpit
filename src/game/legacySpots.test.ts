import { describe, expect, it } from 'vitest';
import { buildableCells, cellCenter, cellFromKey, distanceToPath, isBuildableTerrain } from '../sim';
import { LEGACY_SPOT_CELLS, spotCenter, spotIdOf, V1_SPOT_POSITIONS } from './legacySpots';

/** Nearest buildable cell; ties by closest path distance to the spot's own, then lower cellKey. */
function nearestBuildable(p: { x: number; y: number }) {
  const own = distanceToPath(p);
  return buildableCells()
    .map((ok, key) => ({ ok, key, cell: cellFromKey(key) }))
    .filter((c) => c.ok)
    .map((c) => {
      const q = cellCenter(c.cell);
      return { ...c, d: Math.hypot(q.x - p.x, q.y - p.y), match: Math.abs(distanceToPath(q) - own) };
    })
    .sort((a, b) => a.d - b.d || a.match - b.match || a.key - b.key)[0].cell;
}

describe('legacy spot cells', () => {
  it('each v1 spot maps to its nearest buildable cell by the documented rule', () => {
    expect(LEGACY_SPOT_CELLS).toEqual(V1_SPOT_POSITIONS.map(nearestBuildable));
  });

  it('every legacy cell is buildable and the ten are distinct and well apart', () => {
    LEGACY_SPOT_CELLS.forEach((c, i) => {
      expect(isBuildableTerrain(c)).toBe(true);
      LEGACY_SPOT_CELLS.forEach((o, j) => {
        if (i === j) return;
        const a = cellCenter(c);
        const b = cellCenter(o);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(50);
      });
    });
  });

  it('spotCenter and spotIdOf translate between spot ids and cells', () => {
    expect(spotCenter(2)).toEqual({ x: 240, y: 176 });
    expect(spotIdOf({ col: 7, row: 7 })).toBe(3);
    expect(spotIdOf({ col: 0, row: 0 })).toBeNull();
  });
});
