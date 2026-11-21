// Player actions: build, upgrade, sell. Allowed in 'setup' and 'wave'
// (DESIGN.md: "at any time, including mid-wave"), refused once the game is
// won or lost. Each mutates the state in place and returns a typed result.
// A successful action appends its event (build, upgrade, sell) to
// state.events, where it stays until the next tick clears the list.

import { cellKey, isBuildableTerrain, sameCell, type Cell } from './grid';
import { sellRefund, TOWER_DEFS } from './towers';
import type { GameState, Tower, TowerType } from './types';

export type BuildResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'not-buildable' | 'cell-occupied' | 'not-enough-gold' };

export type UpgradeResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' | 'already-upgraded' | 'not-enough-gold' };

export type SellResult =
  | { ok: true; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' };

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

export function towerAt(state: GameState, cell: Cell): Tower | undefined {
  return state.towers.find((t) => sameCell(t.cell, cell));
}

/**
 * Build on `cell`. Refused when the game is over, the cell is outside the
 * grid, on the path strip or not an integer cell ('not-buildable'), already
 * holds a tower, or gold is short, checked in that order.
 */
export function buildTower(state: GameState, cell: Cell, type: TowerType): BuildResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (!isBuildableTerrain(cell)) return { ok: false, reason: 'not-buildable' };
  if (towerAt(state, cell)) return { ok: false, reason: 'cell-occupied' };
  const cost = TOWER_DEFS[type].cost;
  if (state.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  state.gold -= cost;
  const tower: Tower = { cell: { col: cell.col, row: cell.row }, type, upgraded: false, cooldownTicks: 0, spent: cost };
  state.towers.push(tower);
  state.towers.sort((a, b) => cellKey(a.cell) - cellKey(b.cell));
  state.events.push({ kind: 'build', cell: { col: cell.col, row: cell.row }, tower: type });
  return { ok: true, tower, gold: state.gold };
}

export function upgradeTower(state: GameState, cell: Cell): UpgradeResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  if (tower.upgraded) return { ok: false, reason: 'already-upgraded' };
  const cost = TOWER_DEFS[tower.type].upgradeCost;
  if (state.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  state.gold -= cost;
  tower.upgraded = true;
  tower.spent += cost;
  state.events.push({ kind: 'upgrade', cell: { col: tower.cell.col, row: tower.cell.row }, tower: tower.type });
  return { ok: true, tower, gold: state.gold };
}

export function sellTower(state: GameState, cell: Cell): SellResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  const refund = sellRefund(tower.spent);
  state.gold += refund;
  state.towers = state.towers.filter((t) => t !== tower);
  state.events.push({ kind: 'sell', cell: { col: tower.cell.col, row: tower.cell.row }, tower: tower.type, refund });
  return { ok: true, refund, gold: state.gold };
}
