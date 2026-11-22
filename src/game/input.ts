// Pointer geometry for the build UI: which grid cell is under the pointer,
// what a click means, and where the tower panel goes next to a tower. Pure
// functions with no Phaser, so they are unit tested in input.test.ts.

import { CELL, distanceToPath, isBuildable, towerAt, type Cell, type GameState, type MapDef, type Point, type Rect } from '../sim';
import { labelAbove, LABEL_HEIGHT, LABEL_OFFSET_Y, labelX } from './draw/labels';
import { PATH_WIDTH } from './draw/map';
import { LANDSCAPE, type Layout } from './layout';

export type { Rect };

/** The landscape map area. Panels and ghosts stay inside the layout's map box, never over the HUD. */
export const MAP_AREA: Rect = LANDSCAPE.map;

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
 * The grid cell under canvas point (x, y), or null outside the map (the HUD
 * included), through `layout` (milestone 32b). A point on a shared edge
 * belongs to the cell to its right or below.
 */
export function cellAt(x: number, y: number, layout: Layout = LANDSCAPE): Cell | null {
  return layout.cellAt(x, y);
}

/** The 32 px square of a cell in world coordinates (for world-space Graphics). */
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

export function classifyClick(x: number, y: number, ui: Rect | null, state: GameState, layout: Layout = LANDSCAPE): ClickTarget {
  if (ui && contains(ui, x, y)) return { kind: 'ui' };
  const cell = layout.cellAt(x, y);
  if (cell === null) return { kind: 'outside' };
  if (towerAt(state, cell)) return { kind: 'tower', cell };
  return isBuildable(state, cell) ? { kind: 'buildable', cell } : { kind: 'blocked', cell };
}

/** True if (x, y) lies on the map's drawn path strip (PATH_WIDTH wide, round joins). */
export function onPath(x: number, y: number, map: MapDef): boolean {
  return distanceToPath({ x, y }, map) <= PATH_WIDTH / 2;
}

/** Samples per side for pathCover: a 9 x 9 grid that includes the corners and the centre. */
const COVER_SAMPLES = 9;

/**
 * Approximate share (0 to 1) of a canvas box that lies over the path, from a
 * grid of sample points (turned into world points by `layout`). Used only to
 * rank candidate sides, so coarse is fine.
 */
export function pathCover(x: number, y: number, width: number, height: number, map: MapDef, layout: Layout = LANDSCAPE): number {
  let hits = 0;
  for (let i = 0; i < COVER_SAMPLES; i++) {
    for (let j = 0; j < COVER_SAMPLES; j++) {
      const w = layout.toWorld({ x: x + (width * i) / (COVER_SAMPLES - 1), y: y + (height * j) / (COVER_SAMPLES - 1) });
      if (onPath(w.x, w.y, map)) hits++;
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

/** Height of the tower panel's kill count line above its buttons (milestone 25c, ui/towerPanel.ts). */
export const KILLS_LINE_H = 20;

/**
 * Top-left corner for a `width` x `height` panel beside the tower at
 * `centre`, clamped inside the map area (never over the HUD). The candidates
 * are right, left, below and above. A candidate over the tower's own cell or
 * label (the clamp can push one there) is skipped, so the tower stays
 * visible and clickable; among the rest, the one over the least path wins,
 * (of `map`, the game's map) so the player can still see the enemies. Ties keep that order. Panels may
 * cover other towers.
 */
export function placeBeside(centre: Point, width: number, height: number, map: MapDef, layout: Layout = LANDSCAPE): Point {
  const area = layout.map;
  const clamp = (x: number, y: number): Point => ({
    x: Math.min(area.x + area.width - PANEL_MARGIN - width, Math.max(area.x + PANEL_MARGIN, x)),
    y: Math.min(area.y + area.height - PANEL_MARGIN - height, Math.max(area.y + PANEL_MARGIN, y)),
  });
  const own: Rect = { x: centre.x - CELL / 2, y: centre.y - CELL / 2, width: CELL, height: CELL };
  // Portrait shows no tower labels (milestone 32b), so only the tower's own cell is kept clear there.
  const label = layout.kind === 'landscape' ? labelRect(centre) : own;
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
    const cover = pathCover(p.x, p.y, width, height, map, layout);
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

/**
 * Portrait (milestone 32b follow-up): the lift is a size on the screen, this
 * many CSS px, so the ghost and the aim circle clear a thumb whatever the
 * canvas's scale (75 canvas px on a 390 x 763 phone). Landscape keeps
 * DRAG_LIFT canvas px (48 CSS px on the 960 x 580 desktop, 51.2 on the
 * 1024 x 768 tablet), so its frames and tests do not move.
 */
export const LIFT_CSS = 48;

/** The lift in canvas px for `layout`, given the canvas px per CSS px of the fitted canvas. */
export function liftPx(layout: Layout, canvasPerCss: number): number {
  return layout.kind === 'portrait' ? Math.round(LIFT_CSS * canvasPerCss) : DRAG_LIFT;
}

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
export function dragTargetCell(x: number, y: number, touch: boolean, layout: Layout = LANDSCAPE, lift = DRAG_LIFT): Cell | null {
  // The lift is always toward the top of the screen, whatever the layout.
  return layout.cellAt(x, touch ? y - lift : y);
}

/**
 * True when a mouse drag has lost its button (milestone 25a follow-up): the
 * mouseup happened where the page never saw it (another window, a system
 * dialog), so the pointer moves with no button down. The drag then cancels.
 */
export function mouseDragLost(isDown: boolean, buttons: number): boolean {
  return !isDown || buttons === 0;
}
