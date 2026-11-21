// Tower fire: targeting (with the Mortar's minimum range), damage, splash,
// slow, burn, kills and bounty. Each shot is also recorded in state.shots for
// the renderer. Also the burn status step. game.ts calls burnEnemies then
// fireTowers once per wave tick, after movement and exit removal, before
// spawns.

import { ENEMY_STATS } from './enemies';
import { cellCenter } from './grid';
import { MAP, positionAlongPath } from './map';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import { shotCooldown, towerStats } from './towers';
import type { Enemy, GameState, Point, Shot, Tower } from './types';

/**
 * An enemy is dead at hp <= KILL_EPSILON rather than hp <= 0. Burn ticks
 * subtract dps / 60, which floating point cannot hold exactly (5 / 60), so
 * 216 ticks of a 5/s burn leave about 1e-14 hp on an enemy that has exactly
 * 18. The epsilon makes burn kills land on the tick plain arithmetic says.
 * Integer hp (every v1 rule) is unaffected.
 */
export const KILL_EPSILON = 1e-9;

export function isDead(enemy: Enemy): boolean {
  return enemy.hp <= KILL_EPSILON;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Where a tower stands: its cell centre. Range and shots are measured from here. */
export function towerPosition(tower: Tower): Point {
  return cellCenter(tower.cell);
}

/** Enemy position on the map. */
export function enemyPosition(enemy: Enemy): Point {
  return positionAlongPath(MAP, enemy.distance);
}

/**
 * The enemy this tower would shoot now: at a distance in [minRange, range]
 * (both inclusive; minRange is 0 except for the Mortar) and furthest along
 * the path; ties go to the lower id. Undefined if none qualifies.
 */
export function findTarget(state: GameState, tower: Tower): Enemy | undefined {
  const from = towerPosition(tower);
  const { range, minRange } = towerStats(tower);
  let best: Enemy | undefined;
  for (const enemy of state.enemies) {
    if (isDead(enemy)) continue;
    const d = dist(from, enemyPosition(enemy));
    if (d > range || d < minRange) continue;
    if (!best || enemy.distance > best.distance || (enemy.distance === best.distance && enemy.id < best.id)) {
      best = enemy;
    }
  }
  return best;
}

/**
 * Apply a slow. Slows do not stack: a slow of equal or greater strength than
 * the active one replaces it and refreshes the duration; a weaker one does
 * nothing.
 */
export function applySlow(enemy: Enemy, slow: number, ticks: number): void {
  const active = enemy.slowTicksLeft > 0 ? enemy.slow : 0;
  if (slow < active) return;
  enemy.slow = slow;
  enemy.slowTicksLeft = ticks;
}

/**
 * Apply a burn. Burns do not stack: a burn with dps equal to or greater than
 * the active one replaces it (strength and duration); a weaker one does
 * nothing.
 */
export function applyBurn(enemy: Enemy, dps: number, ticks: number): void {
  const active = (enemy.burnTicksLeft ?? 0) > 0 ? (enemy.burnDps ?? 0) : 0;
  if (dps < active) return;
  enemy.burnDps = dps;
  enemy.burnTicksLeft = ticks;
}

/**
 * Burn status step: every burning enemy takes burnDps / 60 damage, doubled
 * while it is slowed by tar (slowTicksLeft > 0), then its burn timer counts
 * down. Burn deaths pay their bounty and are removed like any kill.
 */
export function burnEnemies(state: GameState): void {
  let burned = false;
  for (const enemy of state.enemies) {
    const left = enemy.burnTicksLeft ?? 0;
    if (left <= 0) continue;
    const dps = enemy.burnDps ?? 0;
    enemy.hp -= (dps / TICKS_PER_SECOND) * (enemy.slowTicksLeft > 0 ? 2 : 1);
    enemy.burnTicksLeft = left - 1;
    if (enemy.burnTicksLeft === 0) enemy.burnDps = 0;
    burned = true;
  }
  if (burned) removeDead(state);
}

/** Remove dead enemies (isDead) and pay their bounty. */
function removeDead(state: GameState): void {
  const alive: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (isDead(enemy)) state.gold += ENEMY_STATS[enemy.type].bounty;
    else alive.push(enemy);
  }
  state.enemies = alive;
}

/** One tower's step: count down, then fire if ready and a target is in range. */
function towerStep(state: GameState, tower: Tower): void {
  if (tower.cooldownTicks > 0) tower.cooldownTicks -= 1;
  if (tower.cooldownTicks > 0) return;
  const target = findTarget(state, tower);
  if (!target) return;
  const stats = towerStats(tower);
  const shot: Shot = {
    cell: { col: tower.cell.col, row: tower.cell.row },
    tower: tower.type,
    targetId: target.id,
    from: towerPosition(tower),
    to: enemyPosition(target),
  };
  if (stats.splashRadius > 0) shot.splashRadius = stats.splashRadius;
  state.shots.push(shot);
  if (stats.splashRadius > 0) {
    const center = enemyPosition(target);
    for (const enemy of state.enemies) {
      if (dist(center, enemyPosition(enemy)) <= stats.splashRadius) enemy.hp -= stats.damage;
    }
  } else {
    target.hp -= stats.damage;
  }
  if (stats.slow > 0 && !isDead(target)) {
    applySlow(target, stats.slow, secondsToTicks(stats.slowDuration));
  }
  if (stats.burnDps > 0 && !isDead(target)) {
    applyBurn(target, stats.burnDps, secondsToTicks(stats.burnDuration));
  }
  tower.cooldownTicks = shotCooldown(stats);
  removeDead(state);
}

/** Every tower takes its step, in cellKey order; kills resolve between towers. */
export function fireTowers(state: GameState): void {
  for (const tower of state.towers) towerStep(state, tower);
}
