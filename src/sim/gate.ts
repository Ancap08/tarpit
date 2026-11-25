import type { GateDef } from './levelTypes';
import { pathLength, trailPointAt } from './map';
import { TICKS_PER_SECOND } from './time';
import type { GameState, Gate, MapDef } from './types';

export const LAST_STAND_TICKS = 6 * TICKS_PER_SECOND;
export const LAST_STAND_FIRE_RATE = 2;

export function createGate(map: MapDef, def: GateDef): Gate {
  return {
    ...trailPointAt(map, pathLength(map)),
    ...def,
    kind: 'gate',
    hp: def.maxHp,
    fallen: false,
    lastStandTicksLeft: 0,
  };
}

export type RepairRefusal = 'not-in-setup' | 'no-gate' | 'gate-fallen' | 'gate-full' | 'not-enough-gold';

export function repairStatus(state: GameState): { ok: true } | { ok: false; reason: RepairRefusal } {
  const { gate } = state;
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  if (!gate) return { ok: false, reason: 'no-gate' };
  if (gate.fallen || gate.hp <= 0) return { ok: false, reason: 'gate-fallen' };
  if (gate.hp >= gate.maxHp) return { ok: false, reason: 'gate-full' };
  if (state.gold < gate.repairCost) return { ok: false, reason: 'not-enough-gold' };
  return { ok: true };
}

export function repairGate(state: GameState):
  { ok: true; cost: number; hp: number; gold: number } | { ok: false; reason: RepairRefusal } {
  const status = repairStatus(state);
  if (!status.ok) return status;
  const gate = state.gate!;
  state.gold -= gate.repairCost;
  gate.hp = Math.min(gate.maxHp, gate.hp + gate.repairHp);
  return { ok: true, cost: gate.repairCost, hp: gate.hp, gold: state.gold };
}
