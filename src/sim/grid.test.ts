import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame } from './game';
import {
  buildableCells,
  CELL,
  cellCenter,
  cellFromKey,
  cellKey,
  distanceToPath,
  GRID_COLS,
  GRID_ROWS,
  isBuildable,
  isBuildableTerrain,
  isInsideGrid,
  MIN_PATH_CLEARANCE,
  nearestPathPoint,
} from './grid';
import { MAP } from './map';
import type { MapDef } from './types';

describe('grid geometry', () => {
  it('a 30 x 15 grid of 32 px cells covers the 960 x 480 map exactly', () => {
    expect([GRID_COLS, GRID_ROWS, CELL]).toEqual([30, 15, 32]);
    expect(GRID_COLS * CELL).toBe(MAP.width);
    expect(GRID_ROWS * CELL).toBe(MAP.height);
  });

  it('cellCenter is (col * 32 + 16, row * 32 + 16)', () => {
    expect(cellCenter({ col: 0, row: 0 })).toEqual({ x: 16, y: 16 });
    expect(cellCenter({ col: 7, row: 5 })).toEqual({ x: 240, y: 176 });
    expect(cellCenter({ col: 29, row: 14 })).toEqual({ x: 944, y: 464 });
  });

  it('cellKey is row * 30 + col, unique over the grid, and cellFromKey inverts it', () => {
    expect(cellKey({ col: 0, row: 0 })).toBe(0);
    expect(cellKey({ col: 29, row: 0 })).toBe(29);
    expect(cellKey({ col: 0, row: 1 })).toBe(30);
    expect(cellKey({ col: 29, row: 14 })).toBe(449);
    const keys = new Set<number>();
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const k = cellKey({ col, row });
        keys.add(k);
        expect(cellFromKey(k)).toEqual({ col, row });
      }
    }
    expect(keys.size).toBe(450);
  });

  it('isInsideGrid accepts integer cells in range only', () => {
    expect(isInsideGrid({ col: 0, row: 0 })).toBe(true);
    expect(isInsideGrid({ col: 29, row: 14 })).toBe(true);
    for (const c of [
      { col: -1, row: 0 },
      { col: 30, row: 0 },
      { col: 0, row: -1 },
      { col: 0, row: 15 },
      { col: 0.5, row: 0 },
      { col: 0, row: Number.NaN },
      { col: Number.POSITIVE_INFINITY, row: 0 },
    ]) {
      expect(isInsideGrid(c), JSON.stringify(c)).toBe(false);
    }
  });
});

describe('distanceToPath', () => {
  it('is the perpendicular distance to the nearest segment', () => {
    expect(distanceToPath({ x: 80, y: 176 })).toBe(64); // above the first segment
    expect(distanceToPath({ x: 240, y: 176 })).toBe(80); // v1 spot 2
    expect(distanceToPath({ x: 160, y: 240 })).toBe(0); // a corner
  });

  it('beyond a segment end it is the distance to that end point', () => {
    // (0,240) is the spawn; (-30, 280) is 50 px from it.
    expect(distanceToPath({ x: -30, y: 280 })).toBe(50);
  });

  it('nearestPathPoint gives how far along the path the nearest point lies', () => {
    expect(nearestPathPoint({ x: 80, y: 176 })).toEqual({ distance: 64, along: 80 });
    // (240,176): 80 px from (160,176) at along 224 and from (240,96) at along 384; the earlier wins.
    expect(nearestPathPoint({ x: 240, y: 176 })).toEqual({ distance: 80, along: 224 });
  });
});

describe('buildable rule', () => {
  it('a cell is buildable when its centre is at least 36 px from the path centreline, inclusive', () => {
    expect(MIN_PATH_CLEARANCE).toBe(36);
    const mask = buildableCells();
    for (let k = 0; k < GRID_COLS * GRID_ROWS; k++) {
      expect(mask[k], `cell ${k}`).toBe(distanceToPath(cellCenter(cellFromKey(k))) >= 36);
    }
  });

  it('at the path edge: 32 px from the centreline is not buildable, 48 px is', () => {
    // First segment y = 240 runs through row 7's centres.
    expect(isBuildableTerrain({ col: 2, row: 7 })).toBe(false); // 0 px
    expect(isBuildableTerrain({ col: 2, row: 6 })).toBe(false); // (80,208): 32 px
    expect(isBuildableTerrain({ col: 2, row: 8 })).toBe(false); // (80,272): 32 px
    expect(isBuildableTerrain({ col: 2, row: 5 })).toBe(true); // (80,176): 64 px
    // Vertical x = 160 lies on a cell border: centres 144 and 176 are 16 px away.
    expect(isBuildableTerrain({ col: 4, row: 4 })).toBe(false);
    expect(isBuildableTerrain({ col: 5, row: 4 })).toBe(false);
    expect(isBuildableTerrain({ col: 3, row: 4 })).toBe(true); // (112,144): 48 px
    expect(isBuildableTerrain({ col: 6, row: 4 })).toBe(true); // (208,144): 48 px
    // Vertical x = 420: centre 464 is 44 px away (buildable), 432 is 12 px (not).
    expect(isBuildableTerrain({ col: 14, row: 8 })).toBe(true);
    expect(isBuildableTerrain({ col: 13, row: 8 })).toBe(false);
  });

  it('exactly 36 px is buildable (inclusive), 35.9 px is not', () => {
    // A one-segment path placed so a cell centre sits exactly 36 or 35.9 px away.
    const at = (y: number): MapDef => ({ width: 960, height: 480, path: [{ x: 0, y }, { x: 960, y }] });
    // Cell (0,0) centre (16,16).
    expect(buildableCells(at(52))[0]).toBe(true); // 36 px
    expect(buildableCells(at(51.9))[0]).toBe(false); // 35.9 px
  });

  it('346 of the 450 cells are buildable on the v1 map', () => {
    expect(buildableCells().filter(Boolean)).toHaveLength(346);
    expect(buildableCells()).toHaveLength(450);
  });

  it('the mask is computed once per map', () => {
    expect(buildableCells(MAP)).toBe(buildableCells(MAP));
  });

  it('isBuildable also needs the cell to be free', () => {
    const s = createGame();
    const c = { col: 2, row: 5 };
    expect(isBuildable(s, c)).toBe(true);
    expect(buildTower(s, c, 'musketeer').ok).toBe(true);
    expect(isBuildable(s, c)).toBe(false);
    expect(isBuildable(s, { col: 3, row: 5 })).toBe(true);
    expect(isBuildable(s, { col: 30, row: 0 })).toBe(false);
    expect(isBuildable(s, { col: 0, row: 7 })).toBe(false);
  });
});
