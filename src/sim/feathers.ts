import { isBoss, isTarred } from './enemies';
import { positionAlongPath } from './map';
import type { Enemy, GameState } from './types';

/** Run speed is in trail pixels per second. Both durations use combat ticks. */
export const FEATHERS = { runTicks: 15, speed: 40, flinchTicks: 5 } as const;

export function featherEnemy(state: GameState, enemy: Enemy): boolean {
  if (enemy.feathered || isBoss(enemy) || !isTarred(enemy)) return false;
  enemy.feathered = true;
  enemy.runTicksLeft = FEATHERS.runTicks;
  const { x, y } = positionAlongPath(state.map, enemy.distance);
  state.events.push({ kind: 'feathered', enemyId: enemy.id, x, y });
  return true;
}
