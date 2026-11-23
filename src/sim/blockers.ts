import { pathLength, projectOntoTrail } from './map';
import type { MapDef, Point, TrailPoint } from './types';

export const BARRICADE_HP = 400;
export const BARRICADE_SNAP_RADIUS = 40;
export const BARRICADE_END_EXCLUSION = 64;

export type BarricadePlacementRefusal = 'out-of-bounds' | 'off-trail' | 'near-spawn' | 'near-exit';

type BarricadePlacement =
  | { ok: true; point: TrailPoint }
  | { ok: false; reason: BarricadePlacementRefusal; point?: TrailPoint };

/** Resolve the exact same snap and refusal for aiming and casting. */
export function barricadePlacement(map: MapDef, aim: Point): BarricadePlacement {
  if (!(aim.x >= 0 && aim.x <= map.width && aim.y >= 0 && aim.y <= map.height)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const point = projectOntoTrail(map, aim);
  if (Math.hypot(aim.x - point.x, aim.y - point.y) > BARRICADE_SNAP_RADIUS) {
    return { ok: false, reason: 'off-trail', point };
  }
  if (point.distance < BARRICADE_END_EXCLUSION) return { ok: false, reason: 'near-spawn', point };
  if (pathLength(map) - point.distance < BARRICADE_END_EXCLUSION) return { ok: false, reason: 'near-exit', point };
  return { ok: true, point };
}
