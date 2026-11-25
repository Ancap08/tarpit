import { isBoss, isTarred } from './enemies';
import { positionAlongPath } from './map';
import { roadPath } from './roads';
import type { Enemy, GameState } from './types';

/** A runner retreats at its own walking speed for this many moving ticks. */
export const FEATHERS = { runTicks: 88, barrelRunTicks: 63, flinchTicks: 16 } as const;

export function featherEnemy(state: GameState, enemy: Enemy, runTicks: number = FEATHERS.runTicks): boolean {
  if (enemy.feathered || isBoss(enemy) || !isTarred(enemy)) return false;
  enemy.feathered = true;
  enemy.runTicksLeft = runTicks;
  const { x, y } = positionAlongPath(roadPath(state.map, enemy.road), enemy.distance);
  state.events.push({ kind: 'feathered', enemyId: enemy.id, x, y });
  return true;
}
