import { KILL_EPSILON } from './combat';
import { effectiveSlow, ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { TICKS_PER_SECOND } from './time';
import type { Blocker, Enemy } from './types';

/** Find the first live blocker crossed in this step, regardless of input order. */
function contactBetween(blockers: readonly Blocker[], from: number, to: number): Blocker | undefined {
  let first: Blocker | undefined;
  for (const blocker of blockers) {
    if (blocker.hp > 0 && blocker.distance >= from && blocker.distance <= to
      && (!first || blocker.distance < first.distance)) {
      first = blocker;
    }
  }
  return first;
}

/** Move all enemies before applying any blocker damage; broken blockers end with 0 hp. */
export function moveEnemies(enemies: Enemy[], events: GameEvent[], blockers?: readonly Blocker[]): void {
  const attacks = blockers?.length ? new Map<Blocker, number>() : undefined;
  for (const enemy of enemies) {
    const stats = ENEMY_STATS[enemy.type];
    const slow = effectiveSlow(enemy);
    const next = enemy.distance + (stats.speed * (1 - slow)) / TICKS_PER_SECOND;
    const blocker = blockers && !stats.flying ? contactBetween(blockers, enemy.distance, next) : undefined;
    if (blocker && attacks) {
      enemy.distance = blocker.distance;
      attacks.set(blocker, (attacks.get(blocker) ?? 0) + stats.blockerDps);
      events.push({
        kind: 'blockerHit', enemyId: enemy.id, x: blocker.x, y: blocker.y, damage: stats.blockerDps / TICKS_PER_SECOND,
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
  if (!attacks) return;
  for (const [blocker, dps] of attacks) {
    blocker.hp -= dps / TICKS_PER_SECOND;
    if (blocker.hp <= KILL_EPSILON) {
      blocker.hp = 0;
      events.push({ kind: 'blockerBreak', x: blocker.x, y: blocker.y, angle: blocker.angle });
    }
  }
}
