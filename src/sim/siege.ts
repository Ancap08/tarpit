import { applySpecialSlow, isDead } from './combat';
import { isBoss } from './enemies';
import { FEATHERS, featherEnemy } from './feathers';
import { distanceOnRoad } from './roads';
import { SPECIAL_DEFS, tarLingerTicks } from './specials';
import type { Enemy, GameState } from './types';

export function windowTargets(state: GameState, index: number): Enemy[] {
  const window = state.windows?.[index];
  if (state.phase !== 'wave' || !window || window.used) return [];
  return state.enemies.filter(enemy => {
    if (isDead(enemy) || enemy.feathered || isBoss(enemy)) return false;
    const distance = distanceOnRoad(state.map, window.road, enemy);
    return distance !== undefined && distance >= window.from - 1e-10 && distance <= window.to + 1e-10;
  });
}

export function shakeWindow(state: GameState, index: number):
  { ok: true; hits: number } | { ok: false; reason: 'not-in-wave' | 'no-window' | 'spent-window' | 'empty-window' } {
  if (state.phase !== 'wave') return { ok: false, reason: 'not-in-wave' };
  const window = state.windows?.[index];
  if (!window) return { ok: false, reason: 'no-window' };
  if (window.used) return { ok: false, reason: 'spent-window' };
  const targets = windowTargets(state, index);
  if (!targets.length) return { ok: false, reason: 'empty-window' };
  const slowTicks = tarLingerTicks(state.boons);
  for (const enemy of targets) {
    const slow = applySpecialSlow(enemy, SPECIAL_DEFS.tarBarrel.slow, slowTicks);
    if (slow !== null) state.events.push({ kind: 'slowed', enemyId: enemy.id, slow, ticks: slowTicks });
    featherEnemy(state, enemy, FEATHERS.barrelRunTicks);
  }
  window.used = true;
  return { ok: true, hits: targets.length };
}

export function quarteringStatus(state: GameState):
  { ok: true; cost: number } | { ok: false; reason: 'not-in-setup' | 'no-quartering' | 'not-enough-gold' } {
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  const tax = state.wallSiteTax;
  if (tax?.kind !== 'quartering') return { ok: false, reason: 'no-quartering' };
  if (state.gold < tax.price) return { ok: false, reason: 'not-enough-gold' };
  return { ok: true, cost: tax.price };
}

export function payQuartering(state: GameState):
  { ok: true; cost: number; gold: number } | Exclude<ReturnType<typeof quarteringStatus>, { ok: true }> {
  const status = quarteringStatus(state);
  if (!status.ok) return status;
  state.gold -= status.cost;
  delete state.wallSiteTax;
  return { ...status, gold: state.gold };
}
