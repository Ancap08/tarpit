// Pointer geometry for the build UI: which grid cell is under the pointer,
// what a click means, and where the tower panel goes next to a tower. Pure
// functions with no Phaser, so they are unit tested in input.test.ts.

import { CELL, distanceToPath, GRID_COLS, GRID_ROWS, isBuildable, MAP, towerAt, type Cell, type GameState, type Point, type Rect } from '../sim';
import { labelAbove, LABEL_HEIGHT, LABEL_OFFSET_Y, labelX } from './draw/labels';
import { PATH_WIDTH } from './draw/map';

export type { Rect };

/** The map area. Panels and ghosts stay inside it, never over the HUD. */
export const MAP_AREA: Rect = { x: 0, y: 0, width: MAP.width, height: MAP.height };

/** Gap between a tower's centre and the near edge of a panel to its right or left: clears a 56 px label. */
const PANEL_OFFSET = 30;
/**
 * Gap for a panel below or above: clears the tower's label (22 px from the
 * centre plus 16 px tall, below the tower or, on the bottom row, above it).
 */
const PANEL_OFFSET_Y = 40;
/** Keep panels this far from the map edges. */
const PANEL_MARGIN = 4;

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/**
 * The grid cell under (x, y), or null outside the map (the HUD included).
 * A point on a shared edge belongs to the cell to its right or below.
 */
export function cellAt(x: number, y: number): Cell | null {
  if (!(x >= 0 && x < MAP.width && y >= 0 && y < MAP.height)) return null;
  const col = Math.floor(x / CELL);
  const row = Math.floor(y / CELL);
  return col < GRID_COLS && row < GRID_ROWS ? { col, row } : null;
}

/** The 32 px square of a cell. */
export function cellRect(cell: Cell): Rect {
  return { x: cell.col * CELL, y: cell.row * CELL, width: CELL, height: CELL };
}

/**
 * What a pointerdown at (x, y) means. `ui` is the open panel's box, if any:
 * clicks inside it belong to its buttons (a greyed button swallows the
 * click). On the map a click hits a tower, a buildable cell or a blocked
 * cell (path, or off-grid). Outside the map (the HUD) it is `outside`; the
 * HUD buttons act on their own.
 */
export type ClickTarget =
  | { kind: 'ui' }
  | { kind: 'tower'; cell: Cell }
  | { kind: 'buildable'; cell: Cell }
  | { kind: 'blocked'; cell: Cell }
  | { kind: 'outside' };

export function classifyClick(x: number, y: number, ui: Rect | null, state: GameState): ClickTarget {
  if (ui && contains(ui, x, y)) return { kind: 'ui' };
  const cell = cellAt(x, y);
  if (cell === null) return { kind: 'outside' };
  if (towerAt(state, cell)) return { kind: 'tower', cell };
  return isBuildable(state, cell) ? { kind: 'buildable', cell } : { kind: 'blocked', cell };
}

/** True if (x, y) lies on the drawn path strip (PATH_WIDTH wide, round joins). */
export function onPath(x: number, y: number): boolean {
  return distanceToPath({ x, y }) <= PATH_WIDTH / 2;
}

/** Samples per side for pathCover: a 9 x 9 grid that includes the corners and the centre. */
const COVER_SAMPLES = 9;

/**
 * Approximate share (0 to 1) of a box that lies over the path, from a grid
 * of sample points. Used only to rank candidate sides, so coarse is fine.
 */
export function pathCover(x: number, y: number, width: number, height: number): number {
  let hits = 0;
  for (let i = 0; i < COVER_SAMPLES; i++) {
    for (let j = 0; j < COVER_SAMPLES; j++) {
      const px = x + (width * i) / (COVER_SAMPLES - 1);
      const py = y + (height * j) / (COVER_SAMPLES - 1);
      if (onPath(px, py)) hits++;
    }
  }
  return hits / (COVER_SAMPLES * COVER_SAMPLES);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Width allowed for a tower label: "Cannon+" is 7 x 7.2 px plus 3 px padding a side, rounded up. */
const LABEL_WIDTH = 58;

/** The widest label's box under (or, on the bottom row, above) the tower at `centre`, kept inside the map. */
export function labelRect(centre: Point): Rect {
  const top = labelAbove(centre.y) ? centre.y - LABEL_OFFSET_Y - LABEL_HEIGHT : centre.y + LABEL_OFFSET_Y;
  return { x: labelX(centre.x, LABEL_WIDTH) - LABEL_WIDTH / 2, y: top, width: LABEL_WIDTH, height: LABEL_HEIGHT };
}

/**
 * Top-left corner for a `width` x `height` panel beside the tower at
 * `centre`, clamped inside the map area (never over the HUD). The candidates
 * are right, left, below and above. A candidate over the tower's own cell or
 * label (the clamp can push one there) is skipped, so the tower stays
 * visible and clickable; among the rest, the one over the least path wins,
 * so the player can still see the enemies. Ties keep that order. Panels may
 * cover other towers.
 */
export function placeBeside(centre: Point, width: number, height: number): Point {
  const clamp = (x: number, y: number): Point => ({
    x: Math.min(MAP_AREA.x + MAP_AREA.width - PANEL_MARGIN - width, Math.max(MAP_AREA.x + PANEL_MARGIN, x)),
    y: Math.min(MAP_AREA.y + MAP_AREA.height - PANEL_MARGIN - height, Math.max(MAP_AREA.y + PANEL_MARGIN, y)),
  });
  const own: Rect = { x: centre.x - CELL / 2, y: centre.y - CELL / 2, width: CELL, height: CELL };
  const label = labelRect(centre);
  const candidates = [
    clamp(centre.x + PANEL_OFFSET, centre.y - height / 2),
    clamp(centre.x - PANEL_OFFSET - width, centre.y - height / 2),
    clamp(centre.x - width / 2, centre.y + PANEL_OFFSET_Y),
    clamp(centre.x - width / 2, centre.y - PANEL_OFFSET_Y - height),
  ];
  let best: Point | null = null;
  let bestCover = Infinity;
  for (const p of candidates) {
    const box = { x: p.x, y: p.y, width, height };
    if (overlaps(box, own) || overlaps(box, label)) continue;
    const cover = pathCover(p.x, p.y, width, height);
    if (cover < bestCover) {
      best = p;
      bestCover = cover;
    }
  }
  return best ?? candidates[0];
}

/**
 * Drag to place and move (milestone 25a): a press becomes a drag once the
 * pointer is more than DRAG_THRESHOLD px from where it went down.
 */
export const DRAG_THRESHOLD = 8;
/** On touch the drag's target is this many px above the finger, so the finger does not hide the ghost. */
export const DRAG_LIFT = 48;

/** True once (x, y) is more than DRAG_THRESHOLD px from the press at (x0, y0). */
export function pastDragThreshold(x0: number, y0: number, x: number, y: number): boolean {
  return Math.hypot(x - x0, y - y0) > DRAG_THRESHOLD;
}

/**
 * The cell a drag at pointer (x, y) aims at. Touch: the cell under the aim
 * point DRAG_LIFT px above the finger, valid whenever that point is on the
 * map, even with the finger over the HUD (so the bottom row is reachable);
 * null once the aim point is off the map. Mouse: the cell under the
 * pointer, null over the HUD or off the map. A release on null cancels.
 */
export function dragTargetCell(x: number, y: number, touch: boolean): Cell | null {
  return cellAt(x, touch ? y - DRAG_LIFT : y);
}

/**
 * True when a mouse drag has lost its button (milestone 25a follow-up): the
 * mouseup happened where the page never saw it (another window, a system
 * dialog), so the pointer moves with no button down. The drag then cancels.
 */
export function mouseDragLost(isDown: boolean, buttons: number): boolean {
  return !isDown || buttons === 0;
}
