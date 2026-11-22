// Touch help for small screens (milestone 35): snap a lifted ghost to the
// nearest valid cell, pick the nearest tower for a near-miss tap, and place
// the drag magnifier. Pure functions with no Phaser or DOM, unit tested in
// touchAssist.test.ts. Mouse input never goes through them.

import { CELL, cellCenter, cellKey, GRID_COLS, GRID_ROWS, type Cell, type Point, type Rect } from '../sim';

/** A cell within this many cells (centre to centre) of the cell under the lifted point may take the snap. */
export const SNAP_CELLS = 1.5;

/**
 * The cell a touch ghost sits on (milestone 35). `under` is the cell under
 * the lifted point (null off the map: no snap from outside the map), `point`
 * that point in world px, and `canTake` says whether a cell can take the
 * tower now (free buildable terrain; for a move, the tower's own cell too).
 *
 * - `under` can take it: `under`.
 * - Otherwise the candidates are the cells whose centre lies within
 *   SNAP_CELLS cells of `under`'s centre (its eight neighbours) that can
 *   take it; the nearest to `point` wins. Ties go to the lower cellKey
 *   (the upper row, then the left column, in world terms).
 * - No candidate: null (red; a release cancels).
 */
export function snapCell(under: Cell | null, point: Point, canTake: (cell: Cell) => boolean): Cell | null {
  if (under === null) return null;
  if (canTake(under)) return under;
  const reach = Math.floor(SNAP_CELLS);
  const max = SNAP_CELLS * CELL;
  let best: Cell | null = null;
  let bestD = Infinity;
  for (let row = under.row - reach; row <= under.row + reach; row++) {
    for (let col = under.col - reach; col <= under.col + reach; col++) {
      if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS || (col === under.col && row === under.row)) continue;
      if (Math.hypot(col - under.col, row - under.row) * CELL > max) continue;
      const cell = { col, row };
      if (!canTake(cell)) continue;
      const c = cellCenter(cell);
      const d = Math.hypot(c.x - point.x, c.y - point.y);
      // Rows and columns run in cellKey order, so a strict < keeps the lower key on a tie.
      if (d < bestD) {
        best = cell;
        bestD = d;
      }
    }
  }
  return best;
}

/** A touch tap within this many cells of a tower's centre selects it (milestone 35). */
export const NEAR_TOWER_CELLS = 0.75;

/**
 * The tower a touch tap at world point `point` selects when it lands on no
 * tower's cell: the one whose centre is nearest, if within NEAR_TOWER_CELLS
 * cells; ties go to the lower cellKey. Null when none is that close.
 */
export function nearestTower(point: Point, towers: readonly Cell[]): Cell | null {
  let best: Cell | null = null;
  let bestD = NEAR_TOWER_CELLS * CELL;
  for (const t of towers) {
    const c = cellCenter(t);
    const d = Math.hypot(c.x - point.x, c.y - point.y);
    if (d < bestD || (d === bestD && best !== null && cellKey(t) < cellKey(best))) {
      best = t;
      bestD = d;
    }
  }
  return best;
}

/** The magnifier shows when a cell is smaller than this on screen (CSS px). */
export const MAGNIFIER_BELOW_CSS = 28;
/** Magnification (canvas px per canvas px; the camera's zoom). */
export const MAGNIFIER_ZOOM = 2;
/** The magnifier's square side in canvas px. */
export const MAGNIFIER_SIZE = 200;
/** Gap between the magnifier and the map's edges (canvas px). */
export const MAGNIFIER_MARGIN = 10;
/** The finger's keep-out radius around the touch point (canvas px). */
export const FINGER_RADIUS = 56;
/** The keep-out around the target point (canvas px): the ghost's cell and a little more. */
export const TARGET_CLEAR = 24;

/** True when a 32 px cell drawn at `canvasPerCss` canvas px per CSS px is small enough to need the magnifier. */
export function magnifierWanted(canvasPerCss: number): boolean {
  return CELL / canvasPerCss < MAGNIFIER_BELOW_CSS;
}

export type MagnifierSide = 'left' | 'right';
export interface MagnifierBox extends Rect {
  side: MagnifierSide;
  top: boolean;
}

function hitsCircle(r: Rect, p: Point, radius: number): boolean {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy) < radius;
}

/**
 * Where the magnifier goes (canvas px), always inside `map` (so inside the
 * canvas and never over the controls). It prefers the top of the map on
 * `prev`'s side (its side last frame) or, at the start, on the side away
 * from the finger. A box the finger (FINGER_RADIUS) or the target
 * (TARGET_CLEAR) would touch is skipped; the candidates are, in order, the
 * preferred top corner, the other top corner, then the bottom corners in
 * the same order. When every one is touched the preferred top corner stays.
 */
export function placeMagnifier(map: Rect, finger: Point, target: Point, prev: MagnifierSide | null, size = MAGNIFIER_SIZE): MagnifierBox {
  const pref: MagnifierSide = prev ?? (finger.x > map.x + map.width / 2 ? 'left' : 'right');
  const other: MagnifierSide = pref === 'left' ? 'right' : 'left';
  const box = (side: MagnifierSide, top: boolean): MagnifierBox => ({
    x: side === 'left' ? map.x + MAGNIFIER_MARGIN : map.x + map.width - MAGNIFIER_MARGIN - size,
    y: top ? map.y + MAGNIFIER_MARGIN : map.y + map.height - MAGNIFIER_MARGIN - size,
    width: size,
    height: size,
    side,
    top,
  });
  const candidates = [box(pref, true), box(other, true), box(pref, false), box(other, false)];
  return candidates.find((b) => !hitsCircle(b, finger, FINGER_RADIUS) && !hitsCircle(b, target, TARGET_CLEAR)) ?? candidates[0];
}

/** The point the magnifier's camera centres on: `target`, moved so its view stays inside `map`. */
export function magnifierCentre(map: Rect, target: Point, size = MAGNIFIER_SIZE, zoom = MAGNIFIER_ZOOM): Point {
  const half = size / zoom / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi - half, Math.max(lo + half, v));
  return { x: clamp(target.x, map.x, map.x + map.width), y: clamp(target.y, map.y, map.y + map.height) };
}
