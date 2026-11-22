// Touch help for small screens (milestone 35): snap a lifted ghost to the
// nearest valid cell, pick the nearest tower for a near-miss tap, and place
// the drag magnifier. Pure functions with no Phaser or DOM, unit tested in
// touchAssist.test.ts. Mouse input never goes through them.

import { CELL, cellCenter, cellKey, GRID_COLS, GRID_ROWS, type Cell, type MapDef, type Point, type Rect } from '../sim';

/** A cell within this many cells (centre to centre) of the cell under the lifted point may take the snap. */
export const SNAP_CELLS = 1.5;
/** A candidate toward the finger loses to any other allowed candidate at most this much farther (follow-up). */
export const FINGER_SIDE_PENALTY = 1.25;

/** What the snap needs besides the cells: the barriers it may not cross, and which way the finger is. */
export interface SnapContext {
  /** The map: a snap never crosses its trail centreline, its water or its landmarks (the cottage). */
  map: Pick<MapDef, 'path' | 'water' | 'landmarks'>;
  /** Unit world vector toward the bottom of the screen (where the finger is): the negative of the layout's `up`. */
  down: Point;
}

/** Orientation of c against the line a-b: positive, negative or 0 (collinear). */
function orient(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** True when segments p-q and a-b cross at a point inside both (touching ends and collinear overlaps do not count). */
function segmentsCross(p: Point, q: Point, a: Point, b: Point): boolean {
  const d1 = orient(a, b, p);
  const d2 = orient(a, b, q);
  const d3 = orient(p, q, a);
  const d4 = orient(p, q, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** True when segment p-q passes through the open interior of box r (Liang-Barsky clip). */
function segmentEntersRect(p: Point, q: Point, r: Rect): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const clip = (den: number, num: number): boolean => {
    if (den === 0) return num > 0;
    const t = num / den;
    if (den < 0) {
      // Entering across this edge.
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      // Leaving across this edge.
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  if (!clip(-dx, p.x - r.x) || !clip(dx, r.x + r.width - p.x) || !clip(-dy, p.y - r.y) || !clip(dy, r.y + r.height - p.y)) return false;
  return t1 - t0 > 1e-9;
}

function insideRect(p: Point, r: Rect): boolean {
  return p.x > r.x && p.x < r.x + r.width && p.y > r.y && p.y < r.y + r.height;
}

/**
 * True when the straight line from `from` to `to` crosses a barrier: the
 * trail's centreline, or a water or landmark box that `from` is not
 * already in (leaving the box a point starts in is not crossing it).
 */
export function crossesBarrier(from: Point, to: Point, map: SnapContext['map']): boolean {
  for (let i = 1; i < map.path.length; i++) if (segmentsCross(from, to, map.path[i - 1], map.path[i])) return true;
  for (const r of [...(map.water ?? []), ...(map.landmarks ?? [])]) {
    if (!insideRect(from, r) && segmentEntersRect(from, to, r)) return true;
  }
  return false;
}

/**
 * The cell a touch ghost sits on (milestone 35). `under` is the cell under
 * the lifted point (null off the map: no snap from outside the map), `point`
 * that point in world px, and `canTake` says whether a cell can take the
 * tower now (free buildable terrain; for a move, the tower's own cell too).
 *
 * - `under` can take it: `under`.
 * - Otherwise the candidates are the cells whose centre lies within
 *   SNAP_CELLS cells of `under`'s centre (its eight neighbours) that can
 *   take it and that the straight line from `point` reaches without
 *   crossing a barrier (crossesBarrier: the trail centreline, water, the
 *   cottage).
 * - The nearest to `point` wins, except that a candidate on the finger's
 *   side of `point` (its offset has a positive component along `down`)
 *   loses to any other candidate at most FINGER_SIDE_PENALTY times as far:
 *   finger-side distances count FINGER_SIDE_PENALTY times, and on an equal
 *   count the candidate off the finger's side wins. Remaining ties go to the
 *   lower cellKey (the upper row, then the left column, in world terms).
 * - No candidate: null (red; a release cancels).
 */
export function snapCell(under: Cell | null, point: Point, canTake: (cell: Cell) => boolean, ctx: SnapContext): Cell | null {
  if (under === null) return null;
  if (canTake(under)) return under;
  const reach = Math.floor(SNAP_CELLS);
  const max = SNAP_CELLS * CELL;
  let best: Cell | null = null;
  let bestScore = Infinity;
  let bestFinger = false;
  for (let row = under.row - reach; row <= under.row + reach; row++) {
    for (let col = under.col - reach; col <= under.col + reach; col++) {
      if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS || (col === under.col && row === under.row)) continue;
      if (Math.hypot(col - under.col, row - under.row) * CELL > max) continue;
      const cell = { col, row };
      if (!canTake(cell)) continue;
      const c = cellCenter(cell);
      if (crossesBarrier(point, c, ctx.map)) continue;
      const dx = c.x - point.x;
      const dy = c.y - point.y;
      const finger = dx * ctx.down.x + dy * ctx.down.y > 1e-9;
      const score = Math.hypot(dx, dy) * (finger ? FINGER_SIDE_PENALTY : 1);
      // Rows and columns run in cellKey order, so keeping the first of equals keeps the lower key.
      const better = score < bestScore - 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && bestFinger && !finger);
      if (better) {
        best = cell;
        bestScore = score;
        bestFinger = finger;
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
