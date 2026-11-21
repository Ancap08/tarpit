// The build grid (v2 placement, docs/SCOPE-v2.md): the 960 x 480 map is a
// 30 x 15 grid of 32 px cells. A tower stands on one cell; its range and its
// shots are measured from the cell centre.

import { MAP } from './map';
import type { GameState, MapDef, Point } from './types';

export const GRID_COLS = 30;
export const GRID_ROWS = 15;
/** Cell size in pixels. */
export const CELL = 32;
/**
 * A cell is buildable when its centre is at least this far (inclusive) from
 * the path centreline, so a 26 px tower body never touches the 40 px strip.
 */
export const MIN_PATH_CLEARANCE = 36;

export interface Cell {
  col: number;
  row: number;
}

/** Centre of a cell, in pixels. */
export function cellCenter(cell: Cell): Point {
  return { x: cell.col * CELL + CELL / 2, y: cell.row * CELL + CELL / 2 };
}

/** Stable integer id of a cell: row * GRID_COLS + col. Also the tower firing order. */
export function cellKey(cell: Cell): number {
  return cell.row * GRID_COLS + cell.col;
}

/** The cell with the given key. Inverse of cellKey for keys inside the grid. */
export function cellFromKey(key: number): Cell {
  return { col: key % GRID_COLS, row: Math.floor(key / GRID_COLS) };
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.col === b.col && a.row === b.row;
}

/** True for a cell with integer col and row inside the 30 x 15 grid. */
export function isInsideGrid(cell: Cell): boolean {
  return (
    Number.isInteger(cell.col) &&
    Number.isInteger(cell.row) &&
    cell.col >= 0 &&
    cell.col < GRID_COLS &&
    cell.row >= 0 &&
    cell.row < GRID_ROWS
  );
}

/** Nearest point to `p` on segment a-b, as the fraction t along it. */
function segmentT(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  return len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
}

/**
 * The point on the path polyline nearest to `p`: its distance from `p` and
 * how far along the path (from the spawn) it lies. On a tie between
 * segments, the one nearer the spawn wins.
 */
export function nearestPathPoint(point: Point, map: MapDef = MAP): { distance: number; along: number } {
  let best = { distance: Infinity, along: 0 };
  let start = 0;
  for (let i = 1; i < map.path.length; i++) {
    const a = map.path[i - 1];
    const b = map.path[i];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const t = segmentT(point, a, b);
    const d = Math.hypot(a.x + (b.x - a.x) * t - point.x, a.y + (b.y - a.y) * t - point.y);
    if (d < best.distance) best = { distance: d, along: start + len * t };
    start += len;
  }
  return best;
}

/** Shortest distance from `point` to the path polyline (its centreline). */
export function distanceToPath(point: Point, map: MapDef = MAP): number {
  return nearestPathPoint(point, map).distance;
}

const buildableCache = new WeakMap<MapDef, readonly boolean[]>();

/**
 * Buildable mask indexed by cellKey: true when the cell centre is at least
 * MIN_PATH_CLEARANCE px from the path centreline. Computed once per map.
 */
export function buildableCells(map: MapDef = MAP): readonly boolean[] {
  let mask = buildableCache.get(map);
  if (!mask) {
    const cells: boolean[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        cells[cellKey({ col, row })] = distanceToPath(cellCenter({ col, row }), map) >= MIN_PATH_CLEARANCE;
      }
    }
    mask = cells;
    buildableCache.set(map, mask);
  }
  return mask;
}

/** True when the cell is inside the grid and off the path strip (ignores towers). */
export function isBuildableTerrain(cell: Cell, map: MapDef = MAP): boolean {
  return isInsideGrid(cell) && buildableCells(map)[cellKey(cell)];
}

/** True when a tower may be built on `cell` now: inside the grid, off the path, and free. */
export function isBuildable(state: GameState, cell: Cell): boolean {
  return isBuildableTerrain(cell) && !state.towers.some((t) => sameCell(t.cell, cell));
}
