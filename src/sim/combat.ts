// Tower fire: targeting (with the Mortar's minimum range), damage, splash,
// slow, burn, kills and bounty. Milestone 22: flying enemies (Harpy) are
// never targeted by Tar Pit, Cannon or Mortar, splash skips them and burns do
// not stick to them; shielded enemies (Shieldbearer) take half damage from
// shots of SHIELD_THRESHOLD base damage or less (enemies.ts). Each shot is also recorded in state.shots for
// the renderer, and hit, slowed, burn and kill events go to state.events
// (events.ts). Milestone 23: the boss's slowCap caps slows (applySlow) and
// his kill also emits bossDown. Milestone 24: findTarget honours the tower's
// targeting mode; splash, slow and burn follow the chosen target. Also the burn status step. game.ts calls burnEnemies then
// fireTowers once per wave tick, after movement and exit removal, before
// spawns.

import { cappedSlow, ENEMY_STATS, isBoss, isFlying, isTarred, shotDamage } from './enemies';
import { cellCenter } from './grid';
import { MAP, positionAlongPath } from './map';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import { shotCooldown, towerStats } from './towers';
import type { KillCause } from './events';
import type { Enemy, GameState, Point, Shot, TargetingMode, Tower, TowerType } from './types';

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

/** Towers that work on the ground and so never target a flying enemy (milestone 22). */
const GROUND_ONLY: ReadonlySet<TowerType> = new Set<TowerType>(['tarpit', 'cannon', 'mortar']);

/** Whether this tower type may select this enemy as its target. */
export function canTarget(tower: TowerType, enemy: Enemy): boolean {
  return !(isFlying(enemy) && GROUND_ONLY.has(tower));
}

/**
 * Whether `a` beats `b` as a target under `mode` (milestone 24).
 * first: further along the path; last: less far along the path; strongest:
 * more current hp, then further along the path. Remaining ties go to the
 * lower id in every mode.
 */
function preferred(mode: TargetingMode, a: Enemy, b: Enemy): boolean {
  if (mode === 'strongest' && a.hp !== b.hp) return a.hp > b.hp;
  if (a.distance !== b.distance) return mode === 'last' ? a.distance < b.distance : a.distance > b.distance;
  return a.id < b.id;
}

/**
 * The enemy this tower would shoot now: one it can target (canTarget), at a
 * distance in [minRange, range] (both inclusive; minRange is 0 except for
 * the Mortar), then the best by the tower's targeting mode (preferred):
 * 'first' (furthest along the path), 'last' (closest to the spawn) or
 * 'strongest' (most hp). Undefined if none qualifies.
 */
export function findTarget(state: GameState, tower: Tower): Enemy | undefined {
  const from = towerPosition(tower);
  const { range, minRange } = towerStats(tower);
  const mode = tower.targeting ?? 'first';
  let best: Enemy | undefined;
  for (const enemy of state.enemies) {
    if (isDead(enemy) || !canTarget(tower.type, enemy)) continue;
    const d = dist(from, enemyPosition(enemy));
    if (d > range || d < minRange) continue;
    if (!best || preferred(mode, enemy, best)) best = enemy;
  }
  return best;
}

/**
 * Apply a slow. The strength is first capped by the enemy's slowCap (the
 * boss: 30%, milestone 23). Slows do not stack: a slow of equal or greater
 * strength than the active one replaces it and refreshes the duration; a
 * weaker one does nothing. Returns the strength applied, or null if ignored.
 */
export function applySlow(enemy: Enemy, slow: number, ticks: number): number | null {
  const strength = cappedSlow(enemy, slow);
  const active = enemy.slowTicksLeft > 0 ? enemy.slow : 0;
  if (strength < active) return null;
  enemy.slow = strength;
  enemy.slowTicksLeft = ticks;
  return strength;
}

/**
 * Apply a special slow (milestone 25c, the Tar Barrel) on the enemy's
 * special channel, apart from tower slows: capped by slowCap like
 * applySlow; an equal or stronger special slow replaces the active one and
 * refreshes its duration; a weaker one does nothing. A tower slow neither
 * blocks nor shortens it. Returns the strength applied, or null if ignored.
 */
export function applySpecialSlow(enemy: Enemy, slow: number, ticks: number): number | null {
  const strength = cappedSlow(enemy, slow);
  const active = (enemy.specialSlowTicksLeft ?? 0) > 0 ? (enemy.specialSlow ?? 0) : 0;
  if (strength < active) return null;
  enemy.specialSlow = strength;
  enemy.specialSlowTicksLeft = ticks;
  return strength;
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
 * while it is tarred (isTarred: a tower or a special slow is active), then its burn timer counts
 * down. Burn deaths pay their bounty and are removed like any kill.
 */
export function burnEnemies(state: GameState): void {
  let burned = false;
  for (const enemy of state.enemies) {
    const left = enemy.burnTicksLeft ?? 0;
    if (left <= 0) continue;
    const dps = enemy.burnDps ?? 0;
    const damage = (dps / TICKS_PER_SECOND) * (isTarred(enemy) ? 2 : 1);
    enemy.hp -= damage;
    state.events.push({ kind: 'burn', enemyId: enemy.id, damage });
    enemy.burnTicksLeft = left - 1;
    if (enemy.burnTicksLeft === 0) enemy.burnDps = 0;
    burned = true;
  }
  if (burned) removeDead(state, 'burn');
}

/**
 * Remove dead enemies (isDead), pay their bounty and record each kill.
 * Exported for specials (milestone 25b, cause 'special').
 */
export function removeDead(state: GameState, cause: KillCause): void {
  const alive: Enemy[] = [];
  for (const enemy of state.enemies) {
    if (isDead(enemy)) {
      const bounty = ENEMY_STATS[enemy.type].bounty;
      state.gold += bounty;
      state.events.push({ kind: 'kill', enemyId: enemy.id, enemyType: enemy.type, bounty, cause });
      if (isBoss(enemy)) state.events.push({ kind: 'bossDown', enemyId: enemy.id, cause });
    } else alive.push(enemy);
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
  const hit = (enemy: Enemy) => {
    const damage = shotDamage(enemy, stats.damage);
    enemy.hp -= damage;
    state.events.push({ kind: 'hit', enemyId: enemy.id, cell: { ...shot.cell }, tower: tower.type, damage });
  };
  if (stats.splashRadius > 0) {
    // Splash stays on the ground: flying enemies inside the radius are skipped.
    const center = enemyPosition(target);
    for (const enemy of state.enemies) {
      if (!isFlying(enemy) && dist(center, enemyPosition(enemy)) <= stats.splashRadius) hit(enemy);
    }
  } else {
    hit(target);
  }
  if (stats.slow > 0 && !isDead(target)) {
    const ticks = secondsToTicks(stats.slowDuration);
    const applied = applySlow(target, stats.slow, ticks);
    if (applied !== null) state.events.push({ kind: 'slowed', enemyId: target.id, slow: applied, ticks });
  }
  // A burn does not stick to a flying enemy: no surface to burn.
  if (stats.burnDps > 0 && !isDead(target) && !isFlying(target)) {
    applyBurn(target, stats.burnDps, secondsToTicks(stats.burnDuration));
  }
  tower.cooldownTicks = shotCooldown(stats);
  removeDead(state, 'shot');
}

/** Every tower takes its step, in cellKey order; kills resolve between towers. */
export function fireTowers(state: GameState): void {
  for (const tower of state.towers) towerStep(state, tower);
}
