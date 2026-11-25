import { trailPointAt } from './map';
import { projectOntoRoads, roadLength, roadPath } from './roads';
import type { MapDef, Point, TrailPoint } from './types';

export const BARRICADE_HP = 324;
export const BARRICADE_SNAP_RADIUS = 40;
export const BARRICADE_END_EXCLUSION = 64;
export const GUARD_COUNT = 4;
export const GUARD_HP = 72;
export const GUARD_ATTACK_DPS = 10;
export const GUARD_LIFETIME_TICKS = 720;
export const GUARD_SPACING = 12;

export type BarricadePlacementRefusal = 'out-of-bounds' | 'off-trail' | 'near-spawn' | 'near-exit';

type BarricadePlacement =
  | { ok: true; point: TrailPoint }
  | { ok: false; reason: BarricadePlacementRefusal; point?: TrailPoint };

/** Resolve the exact same snap and refusal for aiming and casting. */
export function barricadePlacement(map: MapDef, aim: Point): BarricadePlacement {
  if (!(aim.x >= 0 && aim.x <= map.width && aim.y >= 0 && aim.y <= map.height)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  const point = projectOntoRoads(map, aim);
  if (Math.hypot(aim.x - point.x, aim.y - point.y) > BARRICADE_SNAP_RADIUS) {
    return { ok: false, reason: 'off-trail', point };
  }
  if (point.distance < BARRICADE_END_EXCLUSION) return { ok: false, reason: 'near-spawn', point };
  if (roadLength(map, point.road) - point.distance < BARRICADE_END_EXCLUSION) return { ok: false, reason: 'near-exit', point };
  return { ok: true, point };
}

type GuardsPlacement =
  | { ok: true; point: TrailPoint; points: TrailPoint[] }
  | Extract<BarricadePlacement, { ok: false }>;

/** Shared snap rules, with enough trail before the anchor to fit every guard. */
export function guardsPlacement(map: MapDef, aim: Point): GuardsPlacement {
  const placement = barricadePlacement(map, aim);
  if (!placement.ok) return placement;
  const { point } = placement;
  if (point.distance < (GUARD_COUNT - 1) * GUARD_SPACING) return { ok: false, reason: 'near-spawn', point };
  const points = [point];
  for (let i = 1; i < GUARD_COUNT; i++) {
    points.push({
      ...trailPointAt(roadPath(map, point.road), point.distance - i * GUARD_SPACING),
      ...(point.road === undefined ? {} : { road: point.road }),
    });
  }
  return { ok: true, point, points };
}
