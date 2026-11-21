import type { MapDef, Point } from './types';

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
  buildSpots: [
    { x: 96, y: 160 },
    { x: 96, y: 320 },
    { x: 240, y: 176 },
    { x: 240, y: 240 },
    { x: 340, y: 176 },
    { x: 500, y: 160 },
    { x: 500, y: 304 },
    { x: 600, y: 304 },
    { x: 760, y: 112 },
    { x: 760, y: 272 },
  ],
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
