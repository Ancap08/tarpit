import { distanceOnRoad, enemyPosition, isFlying, positionAlongPath, type Enemy, type GameState, type Point } from '../../sim';
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

type Rank = readonly [number, number];
const frontRanks = [[35, 17], [12, 38]] as const;
const trollRank = [30, 26] as const;
const RENT_WALK_SCALE = 1.16;
const RENT_PACKED_SHIELD_SCALE = 1.23;

export interface RentGateCrowd {
  count: number;
  first?: Enemy;
  second?: Enemy;
}

export function inRentGateBand(gateDistance: number, enemy: Enemy): boolean {
  return Math.abs(enemy.distance - gateDistance) <= SIEGE_DRAW_CAP && !isFlying(enemy);
}

/** Only genuinely held walkers can stand in for the group. Near arrivals
 * add to its count while every member keeps its own simulation position. */
export function rentGateCrowd(state: GameState): RentGateCrowd | undefined {
  const { gate } = state;
  if (!gate || gate.fallen) return;
  const group: RentGateCrowd = { count: 0 };
  for (const enemy of state.enemies) {
    if (!inRentGateBand(gate.distance, enemy)) continue;
    group.count++;
    if (enemy.distance !== gate.distance) continue;
    if (!group.first) group.first = enemy;
    else if (!group.second && group.first.type !== 'troll') group.second = enemy;
  }
  if (group.first) return group;
}

export function rentGateRank(crowd: RentGateCrowd, enemy: Enemy): Rank | undefined {
  if (crowd.first === enemy) return enemy.type === 'troll' ? trollRank : frontRanks[0];
  if (crowd.second === enemy) return frontRanks[1];
}

export function rentStance(state: GameState, layout: Layout, enemy: Enemy, rank?: Rank): SiegeStance {
  const gate = state.gate!;
  if (rank) {
    const [x, y] = rank;
    const side = layout.turned ? 1 : -1;
    const scale = enemy.type === 'troll' ? .79 : enemy.type === 'shieldbearer' ? .87 : 1.1;
    return { ...capSiegeOffset(side * x, y), scale };
  }
  const distance = gate.distance - enemy.distance;
  const atGate = !gate.fallen && distance >= 0 ? Math.max(0, 1 - Math.abs(distance - 40) / 100) : 0;
  const bypass = (layout.turned ? -1 : 1) * 23 * atGate;
  return { x: bypass, y: 0, scale: enemy.type === 'troll' ? .93 : RENT_WALK_SCALE };
}

/** Leave room for the two mixed-speed columns in the late waves. Space
 * the upright bodies on the screen because road spacing alone disappears
 * when different speeds or the hairpin bring two feet together. */
export function rentRoadSpacing(state: GameState, layout: Layout): Map<number, SiegeStance> | undefined {
  if (state.wave < 3 || state.enemies.length < 2 || !state.gate) return;
  const gate = state.gate;
  if (!gate.fallen && state.wave < 5) return;
  const walkers = state.enemies.filter(enemy => !isFlying(enemy) && (gate.fallen || gate.distance - enemy.distance > 140));
  const bodies = walkers.map(enemy => {
    const foot = layout.toScreen(enemyPosition(enemy, state.map));
    const troll = enemy.type === 'troll';
    let dx = 0, dy = 0;
    if (state.wave >= 5) {
      const before = positionAlongPath(state.map, enemy.distance - 18);
      const after = positionAlongPath(state.map, enemy.distance + 18);
      const dir = layout.screenDir(after.x - before.x, after.y - before.y);
      const lane = (troll ? -10 : 10) / (Math.hypot(dir.x, dir.y) || 1);
      dx = -dir.y * lane;
      dy = dir.x * lane;
    }
    const radius = troll ? 25 : 23;
    const scale = troll ? .8 : enemy.type === 'shieldbearer' ? RENT_PACKED_SHIELD_SCALE : RENT_WALK_SCALE;
    return { enemy, radius, scale, x: foot.x, y: foot.y - radius, dx, dy };
  });
  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const gap = a.radius + b.radius;
      const x = b.x + b.dx - a.x - a.dx;
      const y = b.y + b.dy - a.y - a.dy;
      if (Math.abs(x) >= gap || Math.abs(y) >= gap) continue;
      const length = Math.hypot(x, y);
      if (!length || length >= gap) continue;
      const push = (gap - length) * .51 / length;
      a.dx -= x * push;
      a.dy -= y * push;
      b.dx += x * push;
      b.dy += y * push;
    }
    for (const b of bodies) {
      const offset = capSiegeOffset(b.dx, b.dy);
      b.dx = offset.x;
      b.dy = offset.y;
    }
  }
  return new Map(bodies.map(b => [b.enemy.id, { x: b.dx, y: b.dy, scale: b.scale }]));
}

export function rentFlightStance(state: GameState, layout: Layout, enemy: Enemy, slot: number): SiegeStance {
  const gate = state.gate!;
  const progress = enemy.distance - gate.distance;
  const rank = state.wave === 2 ? 0 : slot % 4;
  const climb = Math.max(0, Math.min(1, (progress + 510) / 310, (285 - progress) / 135));
  const loft = climb * climb * (3 - 2 * climb);
  const sill = layout.toScreen(gate);
  const foot = layout.toScreen(positionAlongPath(state.map, enemy.distance));
  const altitude = sill.y - foot.y - 136 - Math.floor(rank / 2) * 32;
  const lane = state.wave === 2 ? 0 : rank % 2 ? 24 : -24;
  // In portrait the lower road folds immediately back under the gate.
  // Climb from its open flank before crossing over the top of the arch.
  const flank = layout.turned ? Math.max(0, Math.min(1, (progress + 600) / 130, (-148 - progress) / 68)) : 0;
  const bend = flank * flank * (3 - 2 * flank);
  const x = lane + Math.max(0, sill.x + 149 - foot.x) * bend;
  return { x, y: Math.min(-12, altitude) * loft - 12 * (1 - loft), scale: .91 };
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
