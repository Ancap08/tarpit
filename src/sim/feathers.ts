import { isBoss, isTarred } from './enemies';
import { positionAlongPath } from './map';
import type { Enemy, GameState } from './types';

/** A runner retreats at its own walking speed for this many moving ticks. */
export const FEATHERS = { runTicks: 72, flinchTicks: 6 } as const;

export function featherEnemy(state: GameState, enemy: Enemy): boolean {
  if (enemy.feathered || isBoss(enemy) || !isTarred(enemy)) return false;
  enemy.feathered = true;
  enemy.runTicksLeft = FEATHERS.runTicks;
  const { x, y } = positionAlongPath(state.map, enemy.distance);
  state.events.push({ kind: 'feathered', enemyId: enemy.id, x, y });
  return true;
}
