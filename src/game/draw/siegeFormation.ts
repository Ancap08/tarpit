import { distanceOnRoad, isFlying, type Enemy, type GameState, type Point } from '../../sim';
import type { Layout } from '../layout';

export interface SiegeStance extends Point {
  scale: number;
}

const COLUMNS = 7;
const ROWS = 5;
const SLOTS = COLUMNS * ROWS;
const APPROACH_PX = 82;
export const SIEGE_DRAW_CAP = 40;

export function capSiegeOffset(x: number, y: number): Point {
  const distance = Math.hypot(x, y);
  const scale = distance > SIEGE_DRAW_CAP ? SIEGE_DRAW_CAP / distance : 1;
  return { x: x * scale, y: y * scale };
}

/** Rent Overdue has one inbound road. Paint a few representatives of the
 * contact there, and count the whole group at its unchanged rule position. */
export function rentGateCrowd(state: GameState): Enemy[] {
  const { gate } = state;
  return gate && !gate.fallen ? state.enemies
    .filter(enemy => enemy.distance === gate.distance && !isFlying(enemy))
    .sort((a, b) => a.id - b.id) : [];
}

type Rank = readonly [number, number];
const frontRanks = [[34, -16], [28, 27], [-22, 32]] as const;
const shieldRanks = [frontRanks[0], frontRanks[2]];
const houndRanks = [[36, 15], [-26, 29]] as const;
const trollRanks = [[6, 36]] as const;

export function rentStance(state: GameState, layout: Layout, enemy: Enemy, rank?: Rank): SiegeStance {
  const gate = state.gate!;
  if (rank) {
    const [x, y] = rank;
    const side = -Math.sign(layout.screenDir(Math.cos(gate.angle), Math.sin(gate.angle)).x);
    return { ...capSiegeOffset(side * x, y), scale: 1.48 };
  }
  const distance = Math.abs(enemy.distance - gate.distance);
  return { x: 0, y: 0, scale: 1.32 + .16 * Math.max(0, 1 - distance / 48) };
}

export function rentGateRanks(crowd: readonly Enemy[]): readonly Rank[] {
  const front = crowd.slice(0, 3);
  // A wide silhouette needs its own rank. Lower poses put the whole
  // miniature within the Keg's radius at the unchanged rule position.
  if (front.some(enemy => enemy.type === 'troll')) return trollRanks;
  if (front.some(enemy => enemy.type === 'wolf')) return houndRanks;
  if (front.some(enemy => enemy.type === 'shieldbearer')) return shieldRanks;
  return frontRanks;
}

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
  const rank = (row - 2) * 14;
  const width = Math.sqrt(1 - (rank / SIEGE_DRAW_CAP) ** 2);
  const offset = capSiegeOffset(((column - 3) * 12 + (row % 2 ? 2 : -2)) * width * arrival * (1 - .44 * yard),
    (rank - 22 * yard) * arrival);
  return { ...offset, scale: 1 + .48 * arrival - .2 * yard };
}
