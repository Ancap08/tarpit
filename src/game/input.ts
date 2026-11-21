// Pointer geometry for the build UI: which build spot is under the pointer,
// what a click means, and where a menu goes next to a spot. Pure functions
// with no Phaser, so they are unit tested in input.test.ts.

import { MAP, type Point } from '../sim';

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

/** Id of the build spot under (x, y), or null. Spots are 96+ px apart, so at most one matches. */
export function spotAt(x: number, y: number): number | null {
  for (let id = 0; id < MAP.buildSpots.length; id++) {
    const s = MAP.buildSpots[id];
    if (Math.hypot(x - s.x, y - s.y) <= SPOT_HIT_RADIUS) return id;
  }
  return null;
}

/** Bounding box of a spot's clickable circle. */
export function spotRect(id: number): Rect {
  const s = MAP.buildSpots[id];
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
  return MAP.buildSpots.some((s) => {
    const cx = Math.min(Math.max(s.x, x), x + width);
    const cy = Math.min(Math.max(s.y, y), y + height);
    return Math.hypot(cx - s.x, cy - s.y) <= SPOT_HIT_RADIUS;
  });
}

/**
 * Top-left corner for a `width` x `height` box beside `spot`, clamped inside
 * the map area. Tries right, left, below, then above, and takes the first
 * that covers no build spot (its own included), so every other spot stays
 * clickable while a menu is open. If none is clear, it goes to the right.
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
  return candidates.find((p) => !coversSpot(p.x, p.y, width, height)) ?? candidates[0];
}
