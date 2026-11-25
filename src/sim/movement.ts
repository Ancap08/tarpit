import { KILL_EPSILON } from './combat';
import { FEATHERS } from './feathers';
import { effectiveSlow, ENEMY_STATS, isBoss } from './enemies';
import type { GameEvent } from './events';
import { commonRoadStart, distanceOnRoad, roadProgress } from './roads';
import { TICKS_PER_SECOND } from './time';
import type { Blocker, Enemy, Gate, Guard, MapDef } from './types';

export const MAX_SIEGE_CONTACT_TICKS = 60 * TICKS_PER_SECOND;

function isGuard(blocker: Blocker | undefined): blocker is Guard {
  return blocker !== undefined && 'kind' in blocker && blocker.kind === 'guard';
}

function isGate(blocker: Blocker): blocker is Gate {
  return 'kind' in blocker && blocker.kind === 'gate';
}

/** Find the first live blocker crossed in this step, regardless of input order. */
function contactBetween(blockers: readonly Blocker[], enemy: Enemy, to: number, map?: MapDef):
  { blocker: Blocker; distance: number } | undefined {
  // A guard offset along the trail and a wall projected onto it can reach
  // the same point through different floating-point operations.
  const tolerance = 1e-10;
  let first: { blocker: Blocker; distance: number } | undefined;
  for (const blocker of blockers) {
    if (blocker.hp <= 0) continue;
    const guard = isGuard(blocker);
    const padding = guard ? tolerance : 0;
    const distance = map ? distanceOnRoad(map, enemy.road, blocker) : blocker.distance;
    if (distance === undefined || distance < enemy.distance - padding || distance > to + padding) continue;
    if (!first || distance < first.distance - tolerance
      || (Math.abs(distance - first.distance) <= tolerance && isGuard(first.blocker) && !guard)) {
      first = { blocker, distance };
    }
  }
  return first;
}

/** Resolve every contact before any damage, allowing both sides to deal a lethal blow. */
export function moveEnemies(enemies: Enemy[], events: GameEvent[], blockers?: readonly Blocker[], speedFactor = 1, map?: MapDef, siege = false): boolean {
  const attacks = blockers?.length ? new Map<Blocker, number>() : undefined;
  let guardTargets: Map<Guard, { enemy: Enemy; arrival: number }> | undefined;
  // Compare simultaneous movement along the trail, including walkers that
  // step across a runner between ticks. The input order cannot affect a pass.
  const starts = enemies.some((enemy) => (enemy.runTicksLeft ?? 0) > 0)
    ? enemies.map((enemy) => ({ distance: map ? roadProgress(map, enemy) : enemy.distance, running: (enemy.runTicksLeft ?? 0) > 0 })) : undefined;
  for (const enemy of enemies) {
    const stats = ENEMY_STATS[enemy.type];
    const runTicks = enemy.runTicksLeft ?? 0;
    const flinchTicks = enemy.flinchTicksLeft ?? 0;
    let next = enemy.distance;
    if (flinchTicks > 0) {
      enemy.flinchTicksLeft = flinchTicks - 1;
    } else if (runTicks > 0) {
      next = Math.max(0, next - stats.speed / TICKS_PER_SECOND);
      enemy.runTicksLeft = next === 0 ? 0 : runTicks - 1;
    } else {
      next += (stats.speed * speedFactor * (1 - effectiveSlow(enemy))) / TICKS_PER_SECOND;
    }
    const contact = blockers?.length && runTicks === 0 && flinchTicks === 0 && !stats.flying
      ? contactBetween(blockers, enemy, next, map) : undefined;
    const blocker = contact?.blocker;
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
    if (contact && blocker && attacks) {
      enemy.distance = contact.distance;
      const ramDps = isGate(blocker) && enemy.type === 'ram' ? blocker.ramGateDps : undefined;
      const dps = isGate(blocker) ? ramDps ?? stats.gateDps ?? stats.blockerDps : stats.blockerDps;
      let totalDps = (attacks.get(blocker) ?? 0) + dps;
      if (siege) {
        enemy.blockedTicks = Math.min(MAX_SIEGE_CONTACT_TICKS, (enemy.blockedTicks ?? 0) + 1);
        // Keep the same contact and break order, even if a barricade was
        // replaced or an early call restarted the wave clock.
        if (enemy.blockedTicks === MAX_SIEGE_CONTACT_TICKS) {
          totalDps = Math.max(totalDps, blocker.hp * TICKS_PER_SECOND);
        }
      }
      attacks.set(blocker, totalDps);
      if (!isGate(blocker)) events.push({
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
  if (starts) {
    for (let i = 0; i < enemies.length; i++) {
      const runner = enemies[i];
      const runnerEnd = map ? roadProgress(map, runner) : runner.distance;
      if (!starts[i].running || runnerEnd >= starts[i].distance) continue;
      for (let j = 0; j < enemies.length; j++) {
        const other = enemies[j];
        if (i === j || other.flinchTicksLeft !== undefined || isBoss(other)) continue;
        const otherEnd = map ? roadProgress(map, other) : other.distance;
        if (map && Math.min(starts[i].distance, otherEnd) < commonRoadStart(map, runner.road, other.road)) continue;
        if (starts[i].distance >= starts[j].distance && runnerEnd <= otherEnd
          && (starts[i].distance > starts[j].distance || runnerEnd < otherEnd)) {
          other.flinchTicksLeft = FEATHERS.flinchTicks;
        }
      }
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
      } else if (!isGate(blocker)) {
        events.push({ kind: 'blockerBreak', x: blocker.x, y: blocker.y, angle: blocker.angle });
      }
    }
  }
  return guardTargets !== undefined;
}
