import { pathLength, projectOntoTrail } from './map';
import type { Enemy, MapDef, Point, TrailPoint } from './types';

interface Road {
  id?: string;
  path: MapDef;
  length: number;
  /** Add to local distance to align with the main road's shared stretch. */
  offset: number;
  join: number;
}

const cache = new WeakMap<MapDef, readonly Road[]>();

function roads(map: MapDef): readonly Road[] {
  const known = cache.get(map);
  if (known) return known;
  const length = pathLength(map);
  const main = { id: map.mainRoad, path: map, length, offset: 0, join: length };
  const entries = [main];
  for (const { id, approach, joinIndex } of map.otherRoads ?? []) {
    const join = pathLength({ ...map, path: map.path.slice(0, joinIndex + 1) });
    const localJoin = pathLength({ ...map, path: [...approach, map.path[joinIndex]] });
    const offset = join - localJoin;
    entries.push({
      id, offset, join, length: length - offset,
      path: { ...map, path: [...approach, ...map.path.slice(joinIndex)] },
    });
    main.join = Math.min(main.join, join);
  }
  cache.set(map, entries);
  return entries;
}

function route(map: MapDef, id?: string): Road {
  const entries = roads(map);
  const road = id === undefined ? entries[0] : entries.find(entry => entry.id === id);
  if (!road) throw new RangeError(`Unknown road ${id} on ${map.id}`);
  return road;
}

export function roadPath(map: MapDef, id?: string): MapDef {
  return id === undefined ? map : route(map, id).path;
}

export function roadLength(map: MapDef, id?: string): number {
  return route(map, id).length;
}

export function roadIds(map: MapDef): readonly (string | undefined)[] {
  return roads(map).map(road => road.id);
}

export function roadProgress(map: MapDef, { road, distance }: Pick<Enemy, 'road' | 'distance'>): number {
  return distance + route(map, road).offset;
}

/** The start of the shared stretch, in aligned distance. Same-road encounters have no cutoff. */
export function commonRoadStart(map: MapDef, a?: string, b?: string): number {
  const first = route(map, a);
  const second = route(map, b);
  return first === second ? -Infinity : Math.max(first.join, second.join);
}

/** Translate a local distance between roads only where their centreline is shared. */
export function distanceOnRoad(map: MapDef, road: string | undefined, point: Pick<TrailPoint, 'road' | 'distance'>): number | undefined {
  if (!map.otherRoads?.length || route(map, road) === route(map, point.road)) return point.distance;
  const progress = roadProgress(map, point);
  if (progress + 1e-10 < commonRoadStart(map, road, point.road)) return undefined;
  return progress - route(map, road).offset;
}

/** Snap in map road order, then segment order. Both previews and casts use this. */
export function projectOntoRoads(map: MapDef, aim: Point): TrailPoint {
  if (!map.otherRoads?.length) return projectOntoTrail(map, aim);
  let best: TrailPoint | undefined;
  let gap = Infinity;
  for (const road of roads(map)) {
    const point = projectOntoTrail(road.path, aim);
    const distance = Math.hypot(point.x - aim.x, point.y - aim.y);
    if (distance < gap) {
      gap = distance;
      best = { ...point, ...(road.id === undefined ? {} : { road: road.id }) };
    }
  }
  return best!;
}
