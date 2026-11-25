import { roadProgress } from '../../sim/roads';
import type { Enemy, Gate, MapDef } from '../../sim/types';

export const RAM_FIRST_SLAM_MS = 350;
export const RAM_SLAM_MS = 900;
export const REPAIR_STRIKES_MS = [0, 250, 520] as const;
export const BELL_STRIKES_MS = [0, 700, 1400] as const;

export function ramAtGate(enemy: Enemy, map: MapDef, gate: Gate): boolean {
  return enemy.type === 'ram' && !gate.fallen && gate.hp > 0
    && !enemy.runTicksLeft && !enemy.flinchTicksLeft
    && Math.abs(roadProgress(map, enemy) - gate.distance) < 1e-7;
}

/** -1 before the first slam, then the index of the latest impact. */
export function ramSlamIndex(contactAgeMs: number): number {
  return Math.max(-1, Math.floor((contactAgeMs - RAM_FIRST_SLAM_MS) / RAM_SLAM_MS));
}

export function gateDamageStage(gate: Gate): 0 | 1 | 2 | 3 {
  if (gate.fallen || gate.hp <= 0) return 3;
  const health = gate.hp / gate.maxHp;
  if (health <= 1 / 3) return 2;
  return health <= 2 / 3 ? 1 : 0;
}
