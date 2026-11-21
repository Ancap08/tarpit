// Tower fire: targeting, damage, splash, slow, kills and bounty. Each shot is
// also recorded in state.shots for the renderer. Called once per wave tick
// from game.ts, after movement and exit removal, before spawns.

import { ENEMY_STATS } from './enemies';
import { cellCenter } from './grid';
import { MAP, positionAlongPath } from './map';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import { towerStats } from './towers';
import type { Enemy, GameState, Point, Shot, Tower } from './types';

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
 * The enemy this tower would shoot now: in range (inclusive) and furthest
 * along the path; ties go to the lower id. Undefined if none is in range.
 */
export function findTarget(state: GameState, tower: Tower): Enemy | undefined {
  const from = towerPosition(tower);
  const range = towerStats(tower).range;
  let best: Enemy | undefined;
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0 || dist(from, enemyPosition(enemy)) > range) continue;
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

/** Remove enemies at hp <= 0 and pay their bounty. */
function removeDead(state: GameState): void {
  const alive: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) state.gold += ENEMY_STATS[enemy.type].bounty;
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
  if (stats.slow > 0 && target.hp > 0) {
    applySlow(target, stats.slow, secondsToTicks(stats.slowDuration));
  }
  tower.cooldownTicks = Math.round(TICKS_PER_SECOND / stats.fireRate);
  removeDead(state);
}

/** Every tower takes its step, in cellKey order; kills resolve between towers. */
export function fireTowers(state: GameState): void {
  for (const tower of state.towers) towerStep(state, tower);
}
