// Player actions: build, upgrade, sell. Allowed in 'setup' and 'wave'
// (DESIGN.md: "at any time, including mid-wave"), refused once the game is
// won or lost. Each mutates the state in place and returns a typed result.

import { MAP } from './map';
import { sellRefund, TOWER_DEFS } from './towers';
import type { GameState, Tower, TowerType } from './types';

export type BuildResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'unknown-spot' | 'spot-occupied' | 'not-enough-gold' };

export type UpgradeResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' | 'already-upgraded' | 'not-enough-gold' };

export type SellResult =
  | { ok: true; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' };

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

export function towerAt(state: GameState, spotId: number): Tower | undefined {
  return state.towers.find((t) => t.spotId === spotId);
}

export function buildTower(state: GameState, spotId: number, type: TowerType): BuildResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (!Number.isInteger(spotId) || spotId < 0 || spotId >= MAP.buildSpots.length) {
    return { ok: false, reason: 'unknown-spot' };
  }
  if (towerAt(state, spotId)) return { ok: false, reason: 'spot-occupied' };
  const cost = TOWER_DEFS[type].cost;
  if (state.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  state.gold -= cost;
  const tower: Tower = { spotId, type, upgraded: false, cooldownTicks: 0, spent: cost };
  state.towers.push(tower);
  state.towers.sort((a, b) => a.spotId - b.spotId);
  return { ok: true, tower, gold: state.gold };
}

export function upgradeTower(state: GameState, spotId: number): UpgradeResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, spotId);
  if (!tower) return { ok: false, reason: 'no-tower' };
  if (tower.upgraded) return { ok: false, reason: 'already-upgraded' };
  const cost = TOWER_DEFS[tower.type].upgradeCost;
  if (state.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  state.gold -= cost;
  tower.upgraded = true;
  tower.spent += cost;
  return { ok: true, tower, gold: state.gold };
}

export function sellTower(state: GameState, spotId: number): SellResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, spotId);
  if (!tower) return { ok: false, reason: 'no-tower' };
  const refund = sellRefund(tower.spent);
  state.gold += refund;
  state.towers = state.towers.filter((t) => t !== tower);
  return { ok: true, refund, gold: state.gold };
}
