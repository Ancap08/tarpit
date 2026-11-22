import type { MapDef, Point, Rect } from './types';

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
export type MapId = 'meadow';

/** Map ids in title-screen order. */
export const MAP_IDS: readonly MapId[] = ['meadow'];

/** The map a game is created on when none is given. */
export const DEFAULT_MAP: MapId = 'meadow';

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
