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
} from './touchAssist';

const same = (a: Cell, b: Cell) => a.col === b.col && a.row === b.row;

describe('snapCell', () => {
  const state = createGame();
  const can = (c: Cell) => isBuildable(state, c);

  it('keeps a cell that can take the tower', () => {
    expect(snapCell({ col: 2, row: 5 }, cellCenter({ col: 2, row: 5 }), can)).toEqual({ col: 2, row: 5 });
  });

  it('is null off the map: no snap from outside', () => {
    expect(snapCell(null, { x: -10, y: 100 }, () => true)).toBeNull();
  });

  it('takes the nearest valid neighbour to the lifted point, never one further than 1.5 cells centre to centre', () => {
    // (2,7) is on Meadow's trail margin; (2,5) is buildable two rows up, out of reach.
    const under = { col: 2, row: 7 };
    expect(isBuildable(state, under)).toBe(false);
    const only = (target: Cell) => (c: Cell) => same(c, target);
    expect(snapCell(under, cellCenter(under), only({ col: 2, row: 5 }))).toBeNull();
    expect(snapCell(under, cellCenter(under), only({ col: 3, row: 8 }))).toEqual({ col: 3, row: 8 });
    // Two candidates: the lifted point near the top of the cell picks the upper one.
    const both = (c: Cell) => same(c, { col: 2, row: 6 }) || same(c, { col: 2, row: 8 });
    expect(snapCell(under, { x: 80, y: 226 }, both)).toEqual({ col: 2, row: 6 });
    expect(snapCell(under, { x: 80, y: 250 }, both)).toEqual({ col: 2, row: 8 });
  });

  it('breaks a tie by the lower cellKey (upper row, then left column)', () => {
    const under = { col: 5, row: 5 };
    const ring = (c: Cell) => !same(c, under);
    // From the centre the four side neighbours are nearest (32 px); the upper one has the lowest key.
    expect(snapCell(under, cellCenter(under), ring)).toEqual({ col: 5, row: 4 });
    const lr = (c: Cell) => same(c, { col: 4, row: 5 }) || same(c, { col: 6, row: 5 });
    expect(snapCell(under, cellCenter(under), lr)).toEqual({ col: 4, row: 5 });
  });

  it('treats an occupied cell as invalid and lets a move go back home', () => {
    const s = createGame();
    s.gold = 1000;
    buildTower(s, { col: 7, row: 5 }, 'musketeer');
    buildTower(s, { col: 8, row: 5 }, 'musketeer');
    const at = { col: 8, row: 5 };
    const placed = snapCell(at, cellCenter(at), (c) => isBuildable(s, c));
    expect(placed).not.toBeNull();
    expect(isBuildable(s, placed!)).toBe(true);
    const home = (c: Cell) => isBuildable(s, c) || same(c, at);
    expect(snapCell(at, cellCenter(at), home)).toEqual(at);
  });

  it('does not look at gold: a broke game snaps the same', () => {
    const s = createGame();
    s.gold = 0;
    expect(snapCell({ col: 2, row: 7 }, cellCenter({ col: 2, row: 7 }), (c) => isBuildable(s, c))).toEqual(
      snapCell({ col: 2, row: 7 }, cellCenter({ col: 2, row: 7 }), can),
    );
  });

  for (const id of MAP_IDS) {
    it(`${id}: every unbuildable cell with a buildable neighbour snaps to a buildable neighbour from anywhere in it`, () => {
      const map = MAPS[id];
      let checked = 0;
      const blocks = new Set<string>();
      for (let row = 0; row < GRID_ROWS; row++) {
        for (let col = 0; col < GRID_COLS; col++) {
          const under = { col, row };
          if (isBuildableTerrain(under, map)) continue;
          const neighbours: Cell[] = [];
          for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) neighbours.push({ col: col + dc, row: row + dr });
          const valid = neighbours.filter((c) => isBuildableTerrain(c, map));
          const canTake = (c: Cell) => isBuildableTerrain(c, map);
          const c0 = cellCenter(under);
          // The centre and four points near the corners of the cell.
          for (const [dx, dy] of [[0, 0], [-15, -15], [15, -15], [-15, 15], [15, 15]]) {
            const p = { x: c0.x + dx, y: c0.y + dy };
            const got = snapCell(under, p, canTake);
            if (valid.length === 0) {
              expect(got).toBeNull();
              continue;
            }
            expect(got, `${id} (${col},${row})`).not.toBeNull();
            expect(valid.some((v) => same(v, got!))).toBe(true);
            const best = Math.min(...valid.map((v) => Math.hypot(cellCenter(v).x - p.x, cellCenter(v).y - p.y)));
            expect(Math.hypot(cellCenter(got!).x - p.x, cellCenter(got!).y - p.y)).toBeCloseTo(best, 9);
          }
          if (valid.length > 0) {
            checked++;
            blocks.add(terrainBlock(under, map)!);
          }
        }
      }
      expect(checked).toBeGreaterThan(20);
      // Trail margins on every map, the cottage on every map, water on Riverbend.
      expect(blocks.has('path')).toBe(true);
      expect(blocks.has('landmark')).toBe(true);
      if (id === 'riverbend') expect(blocks.has('water')).toBe(true);
    });
  }

  it('reaches exactly the eight neighbours (1.5 cells)', () => {
    expect(SNAP_CELLS).toBe(1.5);
    const hit: Cell[] = [];
    snapCell({ col: 10, row: 7 }, cellCenter({ col: 10, row: 7 }), (c) => {
      hit.push(c);
      return false;
    });
    // The cell under the point, then its eight neighbours.
    expect(hit).toHaveLength(9);
  });
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
