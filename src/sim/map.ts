import type { MapDef, Point, Rect, TrailPoint } from './types';

/** Every map is 960 x 480 px (a 30 x 15 grid of 32 px cells). */
export const MAP_WIDTH = 960;
export const MAP_HEIGHT = 480;

/**
 * Where a map's exit cottage sits relative to its exit point (the path's
 * last waypoint): Meadow's box, chimney and roof eaves included (walls
 * x 912..940, roof x 908..944, chimney top y 131, base y 168, 4 px above the
 * path strip's edge), with Meadow's exit at (960, 192). draw/map.ts draws a
 * cottage inside every landmark box.
 */
export function cottageFor(exit: Point): Rect {
  return { x: exit.x - 52, y: exit.y - 61, width: 36, height: 37 };
}

/** The maps players can pick (milestone 27). */
export type MapId = 'meadow' | 'switchback' | 'riverbend';

/** Map ids in title-screen order. */
export const MAP_IDS: readonly MapId[] = ['meadow', 'switchback', 'riverbend'];

/** The map a game is created on when none is given. */
export const DEFAULT_MAP: MapId = 'meadow';

/** Riverbend's river: x 416..544, y 160..480 (milestone 27). */
export const RIVER: Rect = { x: 416, y: 160, width: 128, height: 320 };

function defineMap(id: MapId, path: readonly Point[], water?: readonly Rect[]): MapDef {
  const exit = path[path.length - 1];
  return {
    id,
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    path,
    // The spawn cave sits on the path's cells already; only the cottage is a landmark.
    landmarks: [cottageFor(exit)],
    ...(water ? { water } : {}),
  };
}

/** Every map, by id, from docs/DESIGN.md "Maps". */
export const MAPS: Readonly<Record<MapId, MapDef>> = {
  meadow: defineMap('meadow', [
    { x: 0, y: 240 },
    { x: 160, y: 240 },
    { x: 160, y: 96 },
    { x: 420, y: 96 },
    { x: 420, y: 384 },
    { x: 680, y: 384 },
    { x: 680, y: 192 },
    { x: 960, y: 192 },
  ]),
  // Four lanes 96 px apart, joined by two U-turns and a step down: one row
  // of cells between two lanes reaches both. Length 1728 px.
  switchback: defineMap('switchback', [
    { x: 0, y: 96 },
    { x: 560, y: 96 },
    { x: 560, y: 192 },
    { x: 320, y: 192 },
    { x: 320, y: 288 },
    { x: 560, y: 288 },
    { x: 560, y: 384 },
    { x: 960, y: 384 },
  ]),
  // An arch (up, across, down) with a river down the middle under it:
  // columns 13 to 16, rows 5 to 14 (40 cells), off the bottom edge, its top
  // end drawn as a pool with rounded corners. Length 1536 px.
  riverbend: defineMap(
    'riverbend',
    [
      { x: 0, y: 384 },
      { x: 300, y: 384 },
      { x: 300, y: 96 },
      { x: 660, y: 96 },
      { x: 660, y: 384 },
      { x: 960, y: 384 },
    ],
    [RIVER],
  ),
};

/** True for a registered map id (title selection, test hooks). */
export function isMapId(value: unknown): value is MapId {
  return typeof value === 'string' && (MAP_IDS as readonly string[]).includes(value);
}

/** The map with this id, or the map itself when given one (a test may pass its own MapDef). */
export function resolveMap(map: MapId | MapDef | undefined): MapDef {
  if (map === undefined) return MAPS[DEFAULT_MAP];
  return typeof map === 'string' ? MAPS[map] : map;
}

function segmentLength(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  // The Euclidean length of one nonzero coordinate is its magnitude.
  if (dx === 0) return Math.abs(dy);
  if (dy === 0) return Math.abs(dx);
  return Math.hypot(dx, dy);
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

/** Nearest point along a polyline, preferring the first segment on a tie. */
export function projectOntoTrail(map: MapDef, point: Point): TrailPoint {
  let best: TrailPoint = { ...map.path[0], distance: 0, angle: 0 };
  let bestGap = Infinity;
  let distance = 0;
  for (let i = 1; i < map.path.length; i++) {
    const a = map.path[i - 1];
    const b = map.path[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = segmentLength(a, b);
    if (length === 0) continue;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy)));
    const x = a.x + t * dx;
    const y = a.y + t * dy;
    const gap = (point.x - x) ** 2 + (point.y - y) ** 2;
    if (gap < bestGap) {
      best = { x, y, distance: distance + t * length, angle: Math.atan2(dy, dx) };
      bestGap = gap;
    }
    distance += length;
  }
  return best;
}
