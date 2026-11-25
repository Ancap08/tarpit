import { distanceOnRoad, isFlying, type Enemy, type GameState, type Point } from '../../sim';

export interface SiegeStance extends Point {
  scale: number;
}

const COLUMNS = 7;
const ROWS = 5;
const SLOTS = COLUMNS * ROWS;
const APPROACH_PX = 82;

/** Offsets are canvas pixels. This only poses the actors. The road position
 * remains the contact point for targeting, projectiles and reach previews. */
export function siegeStance(state: Pick<GameState, 'gate' | 'map'>, enemy: Enemy): SiegeStance | undefined {
  const gate = state.gate;
  if (!gate || isFlying(enemy)) return;
  const sill = distanceOnRoad(state.map, enemy.road, gate);
  if (sill === undefined) return;
  const progress = enemy.distance - sill;
  if (progress < -APPROACH_PX) return;
  const slot = (enemy.id * 12) % SLOTS;
  const row = Math.floor(slot / COLUMNS);
  const column = slot % COLUMNS;
  const arrival = Math.min(1, 1 + progress / APPROACH_PX);
  const yard = Math.min(1, Math.max(0, progress / 75));
  if (enemy.type === 'ram') return { x: 0, y: (14 - 12 * yard) * arrival, scale: 1 + .26 * arrival - .12 * yard };
  return {
    x: ((column - 3) * 24 + (row % 2 ? 4 : -4)) * arrival * (1 - .44 * yard),
    y: (9 + row * 14 - 22 * yard) * arrival,
    scale: 1 + .48 * arrival - .2 * yard,
  };
}
