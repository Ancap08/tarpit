// The build grid (v2 placement, docs/SCOPE-v2.md): the 960 x 480 map is a
// 30 x 15 grid of 32 px cells. A tower stands on one cell; its range and its
// shots are measured from the cell centre.

import type { GameState, MapDef, Point, Rect } from './types';

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
export function nearestPathPoint(point: Point, map: MapDef): { distance: number; along: number } {
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
export function distanceToPath(point: Point, map: MapDef): number {
  return nearestPathPoint(point, map).distance;
}

/**
 * Why a cell cannot hold a tower whatever stands on it (milestone 27), in
 * check order: 'outside' the grid (or not an integer cell), on the 'path'
 * strip (centre closer than MIN_PATH_CLEARANCE), on a 'landmark', or in
 * 'water'. Undefined for buildable terrain.
 */
export type TerrainBlock = 'outside' | 'path' | 'landmark' | 'water';

interface MapMasks {
  /** Per cellKey: why the cell is blocked, or undefined when buildable. */
  blocks: readonly (TerrainBlock | undefined)[];
  /** Per cellKey: true when buildable. */
  buildable: readonly boolean[];
}

const maskCache = new WeakMap<MapDef, MapMasks>();

/** True when the cell's 32 px square overlaps the box (touching edges do not count). */
function cellOverlaps(cell: Cell, r: Rect): boolean {
  const x = cell.col * CELL;
  const y = cell.row * CELL;
  return x < r.x + r.width && r.x < x + CELL && y < r.y + r.height && r.y < y + CELL;
}

/** The map's terrain masks, computed once per MapDef object. */
function masks(map: MapDef): MapMasks {
  let found = maskCache.get(map);
  if (!found) {
    const blocks: (TerrainBlock | undefined)[] = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        const cell = { col, row };
        let block: TerrainBlock | undefined;
        if (distanceToPath(cellCenter(cell), map) < MIN_PATH_CLEARANCE) block = 'path';
        else if ((map.landmarks ?? []).some((r) => cellOverlaps(cell, r))) block = 'landmark';
        else if ((map.water ?? []).some((r) => cellOverlaps(cell, r))) block = 'water';
        blocks[cellKey(cell)] = block;
      }
    }
    found = { blocks, buildable: blocks.map((b) => b === undefined) };
    maskCache.set(map, found);
  }
  return found;
}

/**
 * Buildable mask indexed by cellKey: true when the cell centre is at least
 * MIN_PATH_CLEARANCE px from the path centreline and the cell's square
 * overlaps none of the map's landmarks and water. Computed once per map.
 */
export function buildableCells(map: MapDef): readonly boolean[] {
  return masks(map).buildable;
}

/** Why `cell` is not buildable terrain on `map` (TerrainBlock), or undefined when it is. */
export function terrainBlock(cell: Cell, map: MapDef): TerrainBlock | undefined {
  return isInsideGrid(cell) ? masks(map).blocks[cellKey(cell)] : 'outside';
}

/** True when the cell is inside the grid, off the path strip, the landmarks and the water (ignores towers). */
export function isBuildableTerrain(cell: Cell, map: MapDef): boolean {
  return isInsideGrid(cell) && masks(map).buildable[cellKey(cell)];
}

/** True when a tower may be built on `cell` now: buildable terrain on the game's map, and free. */
export function isBuildable(state: GameState, cell: Cell): boolean {
  return isBuildableTerrain(cell, state.map) && !state.towers.some((t) => sameCell(t.cell, cell));
}
