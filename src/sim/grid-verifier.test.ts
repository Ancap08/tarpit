// Milestone 8 verifier: independent checks of the grid rules. The buildable
// mask is recomputed here with separate distance code, not the grid.ts helpers.
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { fireTowers } from './combat';
import { createGame } from './game';
import { buildableCells, cellCenter, cellKey, GRID_COLS, GRID_ROWS, MIN_PATH_CLEARANCE } from './grid';
import { lazyBuild, TRAIL_CELL_ORDER } from './headless';
import { MAPS } from './map';
import type { MapDef, Point } from './types';

/** Distance from p to segment a-b by projection (independent of grid.ts). */
function distToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const l2 = abx * abx + aby * aby;
  let t = (apx * abx + apy * aby) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  return Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
}

function distToPolyline(p: Point, path: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) best = Math.min(best, distToSegment(p, path[i], path[i + 1]));
  return best;
}

// Milestone 9: the implementer updated this rule to match the landmark
// exclusion (a cell whose 32 px square overlaps a landmark box is not
// buildable); the overlap test below is written separately from grid.ts.
function ownMask(map: MapDef): boolean[] {
  const out: boolean[] = [];
  for (let key = 0; key < GRID_COLS * GRID_ROWS; key++) {
    const left = (key % GRID_COLS) * 32;
    const top = Math.floor(key / GRID_COLS) * 32;
    const centre = { x: left + 16, y: top + 16 };
    const onLandmark = (map.landmarks ?? []).some(
      (r) => !(left + 32 <= r.x || r.x + r.width <= left || top + 32 <= r.y || r.y + r.height <= top),
    );
    out.push(distToPolyline(centre, map.path) >= 36 && !onLandmark);
  }
  return out;
}

describe('buildable mask, recomputed independently', () => {
  it('equals buildableCells(MAPS.meadow) cell for cell, with 344 of 450 buildable', () => {
    const mine = ownMask(MAPS.meadow);
    const theirs = buildableCells(MAPS.meadow);
    expect(theirs.length).toBe(450);
    for (let key = 0; key < 450; key++) expect(theirs[key], `key ${key}`).toBe(mine[key]);
    expect(mine.filter(Boolean).length).toBe(344);
  });

  it('the 36 px boundary is inclusive: 36 buildable, 35.9 not (synthetic straight paths)', () => {
    // Row 0 cells have centre y = 16. A horizontal path at y = 16 - d sits d px above them.
    const mapAt = (d: number): MapDef => ({
      id: 'test',
      width: 960,
      height: 480,
      path: [
        { x: 0, y: 16 - d },
        { x: 960, y: 16 - d },
      ],
    });
    expect(MIN_PATH_CLEARANCE).toBe(36);
    expect(buildableCells(mapAt(36))[cellKey({ col: 5, row: 0 })]).toBe(true);
    expect(buildableCells(mapAt(35.9))[cellKey({ col: 5, row: 0 })]).toBe(false);
    expect(buildableCells(mapAt(36.1))[cellKey({ col: 5, row: 0 })]).toBe(true);
    // Beyond the segment end the distance is to the end point (a diagonal): 36 exactly at (3,4,..) style.
    // Path ends at x = 100; cell centre (16 + 32*c, 16): c = 5 -> x 176, dx 76 -> clearly buildable; c = 3 -> x 112, dx 12, dy 36 -> hypot > 36.
    const short: MapDef = {
      id: 'test',
      width: 960,
      height: 480,
      path: [
        { x: 0, y: -20 },
        { x: 100, y: -20 },
      ],
    };
    expect(buildableCells(short)[cellKey({ col: 3, row: 0 })]).toBe(true);
    // End point 36 px away diagonally less than 36 -> refused: endpoint (100, -2): cell (3,0) centre (112,16): hypot(12,18)=21.6
    const near: MapDef = { id: 'test', width: 960, height: 480, path: [{ x: 0, y: -2 }, { x: 100, y: -2 }] };
    expect(buildableCells(near)[cellKey({ col: 3, row: 0 })]).toBe(false);
  });

  it('on the real map the y=240 run puts row 5 centres in columns 0 to 2 (y=176) 64 px away, and no real cell is exactly 36', () => {
    for (let c = 0; c < 3; c++) expect(distToPolyline({ x: 16 + 32 * c, y: 176 }, MAPS.meadow.path)).toBeCloseTo(64, 9);
    const exact = ownMask(MAPS.meadow).filter((_, k) => Math.abs(distToPolyline({ x: (k % 30) * 32 + 16, y: Math.floor(k / 30) * 32 + 16 }, MAPS.meadow.path) - 36) < 1e-9);
    expect(exact.length).toBe(0);
  });

  it('no buildable cell body (26 px square, half-diagonal ignored: centre distance >= 33) overlaps the 40 px strip', () => {
    const mask = buildableCells(MAPS.meadow);
    for (let key = 0; key < 450; key++) {
      if (!mask[key]) continue;
      const c = cellCenter({ col: key % 30, row: Math.floor(key / 30) });
      expect(distToPolyline(c, MAPS.meadow.path), `key ${key}`).toBeGreaterThanOrEqual(20 + 13);
    }
    // Exact check on the square body: nearest point of the 26 px square to the polyline stays >= 20.
    for (let key = 0; key < 450; key++) {
      if (!mask[key]) continue;
      const c = cellCenter({ col: key % 30, row: Math.floor(key / 30) });
      for (const [sx, sy] of [[-13, -13], [13, -13], [-13, 13], [13, 13], [0, -13], [0, 13], [-13, 0], [13, 0]]) {
        expect(distToPolyline({ x: c.x + sx, y: c.y + sy }, MAPS.meadow.path)).toBeGreaterThanOrEqual(20);
      }
    }
  });
});

describe('buildTower refusals', () => {
  const rich = () => {
    const s = createGame();
    s.gold = 10_000;
    return s;
  };
  it('returns the documented reason for path, outside, occupied and non-integer cells', () => {
    const s = rich();
    expect(buildTower(s, { col: 5, row: 7 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' }); // y=240 path
    expect(buildTower(s, { col: -1, row: 0 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, { col: 30, row: 0 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, { col: 0, row: 15 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, { col: 2.5, row: 5 }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(buildTower(s, { col: 2, row: Number.NaN }, 'musketeer')).toEqual({ ok: false, reason: 'not-buildable' });
    expect(s.towers.length).toBe(0);
    expect(s.gold).toBe(10_000);
    expect(buildTower(s, { col: 2, row: 5 }, 'musketeer').ok).toBe(true);
    expect(buildTower(s, { col: 2, row: 5 }, 'cannon')).toEqual({ ok: false, reason: 'cell-occupied' });
    expect(s.towers.length).toBe(1);
  });
});

describe('firing order', () => {
  it('towers fire in cellKey order: the lower key kills first and the higher key records no shot', () => {
    const s = createGame();
    s.gold = 10_000;
    s.phase = 'wave';
    s.wave = 1;
    s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
    const hi = { col: 3, row: 5 }; // key 153, built first
    const lo = { col: 2, row: 5 }; // key 152
    expect(cellKey(lo)).toBeLessThan(cellKey(hi));
    expect(buildTower(s, hi, 'musketeer').ok).toBe(true);
    expect(buildTower(s, lo, 'musketeer').ok).toBe(true);
    // Goblin at path distance 80 = (80,240): 64 px from lo's centre (80,176), ~67.9 from hi's (112,176). hp 12 = one musketeer shot.
    s.enemies = [{ id: 1, type: 'goblin', hp: 12, distance: 80, slow: 0, slowTicksLeft: 0 }];
    s.shots = [];
    fireTowers(s);
    expect(s.shots.map((x) => x.cell)).toEqual([lo]);
    expect(s.enemies.length).toBe(0);
  });
});

describe('lazy archetype order', () => {
  it('TRAIL_CELL_ORDER matches an independent recomputation, and lazyBuild buys the prefix of two consecutive passes', () => {
    const mask = buildableCells(MAPS.meadow);
    // Own walk along the path: the point at distance d, by segment lengths.
    const pointAt = (d: number): Point => {
      let left = d;
      for (let i = 0; i + 1 < MAPS.meadow.path.length; i++) {
        const a = MAPS.meadow.path[i];
        const b = MAPS.meadow.path[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
        left -= len;
      }
      return MAPS.meadow.path[MAPS.meadow.path.length - 1];
    };
    let total = 0;
    for (let i = 0; i + 1 < MAPS.meadow.path.length; i++) total += Math.hypot(MAPS.meadow.path[i + 1].x - MAPS.meadow.path[i].x, MAPS.meadow.path[i + 1].y - MAPS.meadow.path[i].y);
    const used = new Set<number>();
    const walk = () => {
      const cells: number[] = [];
      for (let d = 96; d <= total; d += 96) {
        const p = pointAt(d);
        const pick = [...Array(450).keys()]
          .filter((k) => mask[k] && !used.has(k))
          .map((k) => ({ k, dist: Math.hypot((k % 30) * 32 + 16 - p.x, Math.floor(k / 30) * 32 + 16 - p.y) }))
          .filter((c) => c.dist <= 72)
          .sort((a, b) => a.dist - b.dist || a.k - b.k)[0];
        if (pick) {
          used.add(pick.k);
          cells.push(pick.k);
        }
      }
      return cells;
    };
    const mine = walk();
    const second = walk();
    expect(TRAIL_CELL_ORDER.map(cellKey)).toEqual(mine);
    const first6 = TRAIL_CELL_ORDER.slice(0, 6);
    expect(first6).toEqual([
      { col: 2, row: 5 },
      { col: 6, row: 6 },
      { col: 3, row: 3 },
      { col: 7, row: 1 },
      { col: 10, row: 1 },
      { col: 14, row: 3 },
    ]);
    const bought = lazyBuild().flat().filter((a) => a.type === 'build').map((a) => a.cell);
    expect(bought.length).toBeGreaterThan(mine.length);
    expect(bought.map(cellKey)).toEqual([...mine, ...second].slice(0, bought.length));
    // In the first pass only the first cell sits at x < 96.
    expect(bought.slice(0, mine.length).filter((c) => c.col * 32 + 16 < 96)).toHaveLength(1);
  });
});
