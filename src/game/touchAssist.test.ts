import { describe, expect, it } from 'vitest';
import { buildTower, CELL, cellCenter, createGame, GRID_COLS, GRID_ROWS, isBuildable, isBuildableTerrain, MAP_IDS, MAPS, terrainBlock, type Cell } from '../sim';
import { LANDSCAPE, PORTRAIT } from './layout';
import {
  FINGER_RADIUS,
  magnifierCentre,
  magnifierWanted,
  MAGNIFIER_MARGIN,
  MAGNIFIER_SIZE,
  MAGNIFIER_ZOOM,
  nearestTower,
  placeMagnifier,
  snapCell,
  SNAP_CELLS,
  crossesBarrier,
  FINGER_SIDE_PENALTY,
} from './touchAssist';

const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

/** Landscape and portrait: the world direction toward the bottom of the screen. */
const DOWN_L = { x: 0, y: 1 };
const DOWN_P = { x: 1, y: 0 };
/** A map with no barriers near the test cells (a trail along the far bottom edge). */
const OPEN = { path: [{ x: 0, y: 2000 }, { x: 960, y: 2000 }], water: [], landmarks: [] };
const open = { map: OPEN, down: DOWN_L };

describe('snapCell', () => {
  const state = createGame();
  const can = (c: Cell) => isBuildable(state, c);
  const meadow = { map: MAPS.meadow, down: DOWN_L };

  it('keeps a cell that can take the tower', () => {
    expect(snapCell({ col: 2, row: 5 }, cellCenter({ col: 2, row: 5 }), can, meadow)).toEqual({ col: 2, row: 5 });
  });

  it('is null off the map: no snap from outside', () => {
    expect(snapCell(null, { x: -10, y: 100 }, () => true, open)).toBeNull();
  });

  it('takes the nearest valid neighbour to the lifted point, never one further than 1.5 cells centre to centre', () => {
    const under = { col: 2, row: 7 };
    const only = (target: Cell) => (c: Cell) => same(c, target);
    expect(snapCell(under, cellCenter(under), only({ col: 2, row: 5 }), open)).toBeNull();
    expect(snapCell(under, cellCenter(under), only({ col: 3, row: 8 }), open)).toEqual({ col: 3, row: 8 });
    const both = (c: Cell) => same(c, { col: 2, row: 6 }) || same(c, { col: 2, row: 8 });
    expect(snapCell(under, { x: 80, y: 226 }, both, open)).toEqual({ col: 2, row: 6 });
    // Below the centre by 10 px: the lower cell is 22 px away, the upper 42; 42 > 1.25 x 22, so the lower one still wins.
    expect(snapCell(under, { x: 80, y: 250 }, both, open)).toEqual({ col: 2, row: 8 });
  });

  it('a candidate toward the finger loses to one at most 25% farther', () => {
    const under = { col: 5, row: 5 };
    const c = cellCenter(under);
    const both = (k: Cell) => same(k, { col: 5, row: 4 }) || same(k, { col: 5, row: 6 });
    // Landscape: row 6 is toward the finger. 4 px below centre: 28 vs 36 px; 36 <= 1.25 x 28 = 35? No: the lower one wins.
    expect(snapCell(under, { x: c.x, y: c.y + 4 }, both, open)).toEqual({ col: 5, row: 6 });
    // 3 px below: 29 vs 35; 35 <= 36.25, so the upper one wins.
    expect(snapCell(under, { x: c.x, y: c.y + 3 }, both, open)).toEqual({ col: 5, row: 4 });
    // Portrait: the finger is toward +x (world), so up and down in world are both off the finger's side.
    expect(snapCell(under, { x: c.x, y: c.y + 3 }, both, { map: OPEN, down: DOWN_P })).toEqual({ col: 5, row: 6 });
    const lr = (k: Cell) => same(k, { col: 4, row: 5 }) || same(k, { col: 6, row: 5 });
    expect(snapCell(under, { x: c.x + 3, y: c.y }, lr, { map: OPEN, down: DOWN_P })).toEqual({ col: 4, row: 5 });
  });

  it('breaks a remaining tie by the lower cellKey (upper row, then left column)', () => {
    const under = { col: 5, row: 5 };
    expect(snapCell(under, cellCenter(under), (c) => !same(c, under), open)).toEqual({ col: 5, row: 4 });
    const lr = (c: Cell) => same(c, { col: 4, row: 5 }) || same(c, { col: 6, row: 5 });
    expect(snapCell(under, cellCenter(under), lr, open)).toEqual({ col: 4, row: 5 });
  });

  it('never crosses the trail centreline, water or the cottage', () => {
    const under = { col: 5, row: 5 };
    const c = cellCenter(under);
    const up = (k: Cell) => same(k, { col: 5, row: 4 });
    // A trail centreline across the top of the cell (y 165, between the point and row 4's centre).
    const trail = { map: { path: [{ x: 0, y: 165 }, { x: 960, y: 165 }], water: [], landmarks: [] }, down: DOWN_L };
    expect(snapCell(under, c, up, trail)).toBeNull();
    // A water box in the way; and the same box with the point inside it (leaving it is fine).
    const pond = { x: 150, y: 150, width: 40, height: 10 };
    expect(snapCell(under, c, up, { map: { ...OPEN, water: [pond] }, down: DOWN_L })).toBeNull();
    expect(snapCell(under, { x: 176, y: 155 }, up, { map: { ...OPEN, water: [pond] }, down: DOWN_L })).toEqual({ col: 5, row: 4 });
    // The cottage (a landmark) the same.
    expect(snapCell(under, c, up, { map: { ...OPEN, landmarks: [pond] }, down: DOWN_L })).toBeNull();
    expect(crossesBarrier(c, cellCenter({ col: 5, row: 4 }), OPEN)).toBe(false);
  });

  it('does not look at gold: a broke game snaps the same', () => {
    const s = createGame();
    s.gold = 0;
    const u = { col: 2, row: 7 };
    expect(snapCell(u, cellCenter(u), (c) => isBuildable(s, c), meadow)).toEqual(snapCell(u, cellCenter(u), can, meadow));
  });

  it('a move may go back home; an occupied cell is not a candidate', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, { col: 7, row: 5 }, 'musketeer');
    buildTower(s, { col: 8, row: 5 }, 'musketeer');
    const at = { col: 8, row: 5 };
    const placed = snapCell(at, cellCenter(at), (c) => isBuildable(s, c), meadow);
    expect(placed).not.toBeNull();
    expect(isBuildable(s, placed!)).toBe(true);
    expect(snapCell(at, cellCenter(at), (c) => isBuildable(s, c) || same(c, at), meadow)).toEqual(at);
  });

  it('reaches exactly the eight neighbours (1.5 cells)', () => {
    expect(SNAP_CELLS).toBe(1.5);
    expect(FINGER_SIDE_PENALTY).toBe(1.25);
    const hit: Cell[] = [];
    snapCell({ col: 10, row: 7 }, cellCenter({ col: 10, row: 7 }), (c) => {
      hit.push(c);
      return false;
    }, open);
    // The cell under the point, then its eight neighbours.
    expect(hit).toHaveLength(9);
  });

  // An independent reference (follow-up): candidates listed, barriers found by solving each crossing
  // and by sampling the segment against the boxes, then sorted by the rule. 49 points per unbuildable
  // cell on every map, in both layouts' finger directions.
  function reference(under: Cell, p: { x: number; y: number }, canTake: (c: Cell) => boolean, map: (typeof MAPS)['meadow'], down: { x: number; y: number }): Cell | null {
    if (canTake(under)) return under;
    const crossesLine = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }) => {
      const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
      if (den === 0) return false;
      const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
      const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
      return t > 1e-9 && t < 1 - 1e-9 && u > 1e-9 && u < 1 - 1e-9;
    };
    const boxes = [...(map.water ?? []), ...(map.landmarks ?? [])];
    const inBox = (q: { x: number; y: number }, r: { x: number; y: number; width: number; height: number }) => q.x > r.x && q.x < r.x + r.width && q.y > r.y && q.y < r.y + r.height;
    const list: { cell: Cell; score: number; finger: boolean; key: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cell = { col: under.col + dc, row: under.row + dr };
        if ((!dr && !dc) || cell.col < 0 || cell.row < 0 || cell.col >= GRID_COLS || cell.row >= GRID_ROWS || !canTake(cell)) continue;
        const q = cellCenter(cell);
        let blocked = false;
        for (let i = 1; i < map.path.length && !blocked; i++) blocked = crossesLine(p, q, map.path[i - 1], map.path[i]);
        for (const r of boxes) {
          if (blocked || inBox(p, r)) continue;
          for (let k = 1; k < 400 && !blocked; k++) blocked = inBox({ x: p.x + ((q.x - p.x) * k) / 400, y: p.y + ((q.y - p.y) * k) / 400 }, r);
        }
        if (blocked) continue;
        const finger = (q.x - p.x) * down.x + (q.y - p.y) * down.y > 1e-9;
        list.push({ cell, score: Math.hypot(q.x - p.x, q.y - p.y) * (finger ? 1.25 : 1), finger, key: cell.row * GRID_COLS + cell.col });
      }
    }
    list.sort((a, b) => (Math.abs(a.score - b.score) > 1e-9 ? a.score - b.score : a.finger !== b.finger ? (a.finger ? 1 : -1) : a.key - b.key));
    return list[0]?.cell ?? null;
  }

  for (const id of MAP_IDS) {
    it(`${id}: matches the independent reference at 49 points in every unbuildable cell, both layouts; trail margins, the cottage and (Riverbend) water all snap somewhere`, () => {
      const map = MAPS[id];
      const canTake = (c: Cell) => isBuildableTerrain(c, map);
      const snappedKinds = new Set<string>();
      let samples = 0;
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const under = { col, row };
          if (canTake(under)) continue;
          for (let i = 0; i < 7; i++) {
            for (let j = 0; j < 7; j++) {
              const p = { x: col * CELL + 1 + i * 5, y: row * CELL + 1 + j * 5 };
              for (const down of [DOWN_L, DOWN_P]) {
                const got = snapCell(under, p, canTake, { map, down });
                expect(got, `${id} (${col},${row}) at ${p.x},${p.y}`).toEqual(reference(under, p, canTake, map, down));
                if (got) {
                  snappedKinds.add(terrainBlock(under, map)!);
                  expect(crossesBarrier(p, cellCenter(got), map)).toBe(false);
                }
                samples++;
              }
            }
          }
        }
      }
      expect(samples).toBeGreaterThan(1000);
      expect(snappedKinds.has('path')).toBe(true);
      expect(snappedKinds.has('landmark')).toBe(true);
      if (id === 'riverbend') expect(snappedKinds.has('water')).toBe(true);
    });
  }
});

describe('nearestTower', () => {
  const towers = [{ col: 7, row: 5 }, { col: 8, row: 5 }];
  it('selects a tower whose centre is within 0.75 of a cell', () => {
    const c = cellCenter({ col: 7, row: 5 });
    expect(nearestTower({ x: c.x - 23, y: c.y }, towers)).toEqual({ col: 7, row: 5 });
    expect(nearestTower({ x: c.x, y: c.y - 0.75 * CELL + 0.5 }, towers)).toEqual({ col: 7, row: 5 });
  });
  it('is null further away', () => {
    const c = cellCenter({ col: 7, row: 5 });
    expect(nearestTower({ x: c.x, y: c.y + 0.75 * CELL }, towers)).toBeNull();
    expect(nearestTower({ x: c.x, y: c.y + 40 }, towers)).toBeNull();
  });
  it('picks the nearer of two, and the lower cellKey on a tie', () => {
    const mid = { x: (cellCenter(towers[0]).x + cellCenter(towers[1]).x) / 2, y: cellCenter(towers[0]).y };
    expect(nearestTower({ x: mid.x + 3, y: mid.y }, towers)).toEqual({ col: 8, row: 5 });
    expect(nearestTower(mid, [towers[1], towers[0]])).toEqual({ col: 7, row: 5 });
  });
});

describe('magnifier', () => {
  it('shows only when a cell is under 28 CSS px', () => {
    // Phone portrait: 480 x 1194 in 844 px tall (0.707) -> 22.6 CSS px; phone landscape 0.672 -> 21.5.
    expect(magnifierWanted(1194 / 844)).toBe(true);
    expect(magnifierWanted(580 / 390)).toBe(true);
    // Tablet (1024 / 960) and desktop (1:1).
    expect(magnifierWanted(960 / 1024)).toBe(false);
    expect(magnifierWanted(1)).toBe(false);
  });

  for (const layout of [PORTRAIT, LANDSCAPE]) {
    const m = layout.map;
    const inside = (b: { x: number; y: number; width: number; height: number }) =>
      b.x >= m.x && b.y >= m.y && b.x + b.width <= m.x + m.width && b.y + b.height <= m.y + m.height;

    it(`${layout.kind}: top of the map, away from the finger`, () => {
      const right = { x: m.x + m.width - 60, y: m.y + m.height - 40 };
      const b = placeMagnifier(m, right, { x: right.x, y: right.y - 70 }, null);
      expect(b).toMatchObject({ side: 'left', top: true, x: m.x + MAGNIFIER_MARGIN, y: m.y + MAGNIFIER_MARGIN });
      const left = { x: m.x + 60, y: m.y + m.height - 40 };
      expect(placeMagnifier(m, left, { x: left.x, y: left.y - 70 }, null)).toMatchObject({ side: 'right', top: true });
    });

    it(`${layout.kind}: keeps its side until the finger comes near, then switches`, () => {
      const finger = { x: m.x + m.width / 2 + 20, y: m.y + m.height - 40 };
      expect(placeMagnifier(m, finger, { x: finger.x, y: finger.y - 70 }, 'right').side).toBe('right');
      const near = { x: m.x + m.width - 80, y: m.y + 150 };
      const b = placeMagnifier(m, near, { x: near.x, y: near.y - 70 }, 'right');
      expect(b.side).toBe('left');
      expect(b.top).toBe(true);
    });

    it(`${layout.kind}: never covers the target or the finger, and stays inside the map`, () => {
      for (let x = m.x; x <= m.x + m.width; x += 16) {
        for (let y = m.y; y <= m.y + m.height; y += 16) {
          const finger = { x, y: Math.min(m.y + m.height + 100, y + 75) };
          const b = placeMagnifier(m, finger, { x, y }, null);
          expect(inside(b)).toBe(true);
          expect(b.width).toBe(MAGNIFIER_SIZE);
          const coversTarget = x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height;
          expect(coversTarget, `target (${x},${y})`).toBe(false);
          const fx = Math.max(b.x - finger.x, 0, finger.x - b.x - b.width);
          const fy = Math.max(b.y - finger.y, 0, finger.y - b.y - b.height);
          expect(Math.hypot(fx, fy) >= FINGER_RADIUS || (b.top && b.side === (finger.x > m.x + m.width / 2 ? 'left' : 'right'))).toBe(true);
        }
      }
    });

    it(`${layout.kind}: the view centre keeps the magnified view on the map`, () => {
      const half = MAGNIFIER_SIZE / MAGNIFIER_ZOOM / 2;
      expect(magnifierCentre(m, { x: m.x, y: m.y })).toEqual({ x: m.x + half, y: m.y + half });
      const mid = { x: m.x + m.width / 2, y: m.y + m.height / 2 };
      expect(magnifierCentre(m, mid)).toEqual(mid);
    });
  }
});
