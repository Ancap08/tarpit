import type { MapDef, Point, Rect } from './types';

/**
 * The exit cottage's bounding box, chimney and roof eaves included: walls
 * x 912..940, roof x 908..944, chimney top y 131, base y 168 (4 px above
 * the path strip's edge). draw/map.ts draws the cottage inside it.
 */
export const COTTAGE: Rect = { x: 908, y: 131, width: 36, height: 37 };

/** The one v1 map, from docs/DESIGN.md. */
export const MAP: MapDef = {
  width: 960,
  height: 480,
  path: [
    { x: 0, y: 240 },
    { x: 160, y: 240 },
    { x: 160, y: 96 },
    { x: 420, y: 96 },
    { x: 420, y: 384 },
    { x: 680, y: 384 },
    { x: 680, y: 192 },
    { x: 960, y: 192 },
  ],
  // The spawn cave sits on the path's cells already; only the cottage is a landmark.
  landmarks: [COTTAGE],
};

function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Total length of the path polyline, in pixels. */
export function pathLength(map: MapDef): number {
  let total = 0;
  for (let i = 1; i < map.path.length; i++) {
    total += segmentLength(map.path[i - 1], map.path[i]);
  }
  return total;
}

/**
 * Point at `distance` pixels along the path, by linear interpolation.
 * Distances below 0 clamp to the spawn; past the end clamp to the exit.
 */
export function positionAlongPath(map: MapDef, distance: number): Point {
  const path = map.path;
  if (distance <= 0) return { x: path[0].x, y: path[0].y };
  let remaining = distance;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const len = segmentLength(a, b);
    if (remaining <= len) {
      const t = len === 0 ? 0 : remaining / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    remaining -= len;
  }
  const end = path[path.length - 1];
  return { x: end.x, y: end.y };
}
