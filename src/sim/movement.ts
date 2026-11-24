import { KILL_EPSILON } from './combat';
import { effectiveSlow, ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { TICKS_PER_SECOND } from './time';
import type { Blocker, Enemy, Guard } from './types';

function isGuard(blocker: Blocker | undefined): blocker is Guard {
  return blocker !== undefined && 'kind' in blocker && blocker.kind === 'guard';
}

/** Find the first live blocker crossed in this step, regardless of input order. */
function contactBetween(blockers: readonly Blocker[], from: number, to: number): Blocker | undefined {
  // A guard offset along the trail and a wall projected onto it can reach
  // the same point through different floating-point operations.
  const tolerance = 1e-10;
  let first: Blocker | undefined;
  for (const blocker of blockers) {
    if (blocker.hp <= 0) continue;
    const guard = isGuard(blocker);
    const padding = guard ? tolerance : 0;
    if (blocker.distance < from - padding || blocker.distance > to + padding) continue;
    if (!first || blocker.distance < first.distance - tolerance
      || (Math.abs(blocker.distance - first.distance) <= tolerance && isGuard(first) && !guard)) {
      first = blocker;
    }
  }
  return first;
}

/** Resolve every contact before any damage, allowing both sides to deal a lethal blow. */
export function moveEnemies(enemies: Enemy[], events: GameEvent[], blockers?: readonly Blocker[], speedFactor = 1): boolean {
  const attacks = blockers?.length ? new Map<Blocker, number>() : undefined;
  let guardTargets: Map<Guard, { enemy: Enemy; arrival: number }> | undefined;
  for (const enemy of enemies) {
    const stats = ENEMY_STATS[enemy.type];
    const slow = effectiveSlow(enemy);
    const next = enemy.distance + (stats.speed * speedFactor * (1 - slow)) / TICKS_PER_SECOND;
    const blocker = blockers?.length && !stats.flying ? contactBetween(blockers, enemy.distance, next) : undefined;
    const guard = isGuard(blocker) ? blocker : undefined;
    if (guard) {
      if (enemy.guardContact?.guardId !== guard.id) {
        enemy.guardContact = { guardId: guard.id, arrivedWithTicksLeft: guard.ticksLeft };
      }
      guardTargets ??= new Map();
      const target = guardTargets.get(guard);
      const arrival = enemy.guardContact.arrivedWithTicksLeft;
      if (!target || arrival > target.arrival || (arrival === target.arrival && enemy.id < target.enemy.id)) {
        guardTargets.set(guard, { enemy, arrival });
      }
    } else if (enemy.guardContact) {
      delete enemy.guardContact;
    }
    if (blocker && attacks) {
      enemy.distance = blocker.distance;
      attacks.set(blocker, (attacks.get(blocker) ?? 0) + stats.blockerDps);
      events.push({
        kind: 'blockerHit', enemyId: enemy.id, x: blocker.x, y: blocker.y, damage: stats.blockerDps / TICKS_PER_SECOND,
        ...(guard ? { guardId: guard.id } : {}),
      });
    } else {
      enemy.distance = next;
    }
    if (enemy.slowTicksLeft > 0) {
      enemy.slowTicksLeft -= 1;
      if (enemy.slowTicksLeft === 0) enemy.slow = 0;
    }
    const special = enemy.specialSlowTicksLeft ?? 0;
    if (special > 0) {
      enemy.specialSlowTicksLeft = special - 1;
      if (special === 1) enemy.specialSlow = 0;
    }
  }
  for (const [guard, { enemy }] of guardTargets ?? []) {
    const damage = guard.attackDps / TICKS_PER_SECOND;
    enemy.hp -= damage;
    events.push({ kind: 'guardStrike', guardId: guard.id, enemyId: enemy.id, x: guard.x, y: guard.y, damage });
  }
  if (!attacks) return false;
  for (const [blocker, dps] of attacks) {
    blocker.hp -= dps / TICKS_PER_SECOND;
    if (blocker.hp <= KILL_EPSILON) {
      blocker.hp = 0;
      if (isGuard(blocker)) {
        events.push({ kind: 'guardDown', guardId: blocker.id, x: blocker.x, y: blocker.y, angle: blocker.angle });
      } else {
        events.push({ kind: 'blockerBreak', x: blocker.x, y: blocker.y, angle: blocker.angle });
      }
    }
  }
  return guardTargets !== undefined;
}
