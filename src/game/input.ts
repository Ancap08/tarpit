// Pointer geometry for the build UI: which build spot is under the pointer,
// what a click means, and where a menu goes next to a spot. Pure functions
// with no Phaser, so they are unit tested in input.test.ts.
//
// Milestone 8: the spots are the ten legacy cells (legacySpots.ts); a spot id
// is only an index into LEGACY_SPOT_CELLS, and every position is a cell centre.

import { distanceToPath, MAP, type Point } from '../sim';
import { PATH_WIDTH } from './draw/map';
import { LEGACY_SPOT_CELLS, spotCenter } from './legacySpots';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A pointer within this many pixels of a spot's centre is on that spot. */
export const SPOT_HIT_RADIUS = 18;

/** The map area. Menus and panels stay inside it, never over the HUD. */
export const MAP_AREA: Rect = { x: 0, y: 0, width: MAP.width, height: MAP.height };

/** Gap between a spot's centre and the near edge of a menu beside it. */
const MENU_OFFSET = 28;
/** Keep menus this far from the map edges. */
const MENU_MARGIN = 4;

export function contains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
}

/** Id of the build spot under (x, y), or null. Spots are 50+ px apart, so at most one matches. */
export function spotAt(x: number, y: number): number | null {
  for (let id = 0; id < LEGACY_SPOT_CELLS.length; id++) {
    const s = spotCenter(id);
    if (Math.hypot(x - s.x, y - s.y) <= SPOT_HIT_RADIUS) return id;
  }
  return null;
}

/** Bounding box of a spot's clickable circle. */
export function spotRect(id: number): Rect {
  const s = spotCenter(id);
  return { x: s.x - SPOT_HIT_RADIUS, y: s.y - SPOT_HIT_RADIUS, width: 2 * SPOT_HIT_RADIUS, height: 2 * SPOT_HIT_RADIUS };
}

/**
 * What a pointerdown at (x, y) means. `ui` is the open menu or panel's box,
 * if any: clicks inside it belong to its buttons (a greyed button swallows
 * the click). Anything else is a spot or "elsewhere", which closes the UI.
 * HUD clicks are "elsewhere" too; the HUD buttons still act on their own.
 */
export type ClickTarget = { kind: 'ui' } | { kind: 'spot'; spotId: number } | { kind: 'elsewhere' };

export function classifyClick(x: number, y: number, ui: Rect | null): ClickTarget {
  if (ui && contains(ui, x, y)) return { kind: 'ui' };
  const spotId = spotAt(x, y);
  return spotId === null ? { kind: 'elsewhere' } : { kind: 'spot', spotId };
}

/** True if the box overlaps any build spot's clickable circle. */
function coversSpot(x: number, y: number, width: number, height: number): boolean {
  return LEGACY_SPOT_CELLS.some((_, id) => {
    const s = spotCenter(id);
    const cx = Math.min(Math.max(s.x, x), x + width);
    const cy = Math.min(Math.max(s.y, y), y + height);
    return Math.hypot(cx - s.x, cy - s.y) <= SPOT_HIT_RADIUS;
  });
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

/**
 * Top-left corner for a `width` x `height` box beside `spot`, clamped inside
 * the map area. The candidates are right, left, below and above. Among those
 * that cover no build spot (its own included, so every other spot stays
 * clickable), the one over the least path wins, so the player can still see
 * the enemies; ties keep that order. If every side covers a spot, it goes to
 * the right.
 */
export function placeBeside(spot: Point, width: number, height: number): Point {
  const clamp = (x: number, y: number): Point => ({
    x: Math.min(MAP_AREA.x + MAP_AREA.width - MENU_MARGIN - width, Math.max(MAP_AREA.x + MENU_MARGIN, x)),
    y: Math.min(MAP_AREA.y + MAP_AREA.height - MENU_MARGIN - height, Math.max(MAP_AREA.y + MENU_MARGIN, y)),
  });
  const candidates = [
    clamp(spot.x + MENU_OFFSET, spot.y - height / 2),
    clamp(spot.x - MENU_OFFSET - width, spot.y - height / 2),
    clamp(spot.x - width / 2, spot.y + MENU_OFFSET),
    clamp(spot.x - width / 2, spot.y - MENU_OFFSET - height),
  ];
  let best: Point | null = null;
  let bestCover = Infinity;
  for (const p of candidates) {
    if (coversSpot(p.x, p.y, width, height)) continue;
    const cover = pathCover(p.x, p.y, width, height);
    if (cover < bestCover) {
      best = p;
      bestCover = cover;
    }
  }
  return best ?? candidates[0];
}
