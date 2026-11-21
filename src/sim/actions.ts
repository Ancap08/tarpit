// Player actions: build, upgrade, sell, and setTargeting (milestone 24).
// Allowed in 'setup' and 'wave' (DESIGN.md: "at any time, including
// mid-wave"), refused once the game is
// won or lost. Milestone 25a adds the planning phase: moveTower and
// undoUpgrade work only in 'setup' (see DESIGN.md "Planning phase"). Each
// mutates the state in place and returns a typed result.
// A successful action appends its event (build, upgrade, sell, targeting,
// move, undoUpgrade) to state.events, where it stays until the next tick
// clears the list.

import { cellKey, isBuildableTerrain, sameCell, type Cell } from './grid';
import { TOWER_DEFS, towerSellValue } from './towers';
import type { GameState, TargetingMode, Tower, TowerType } from './types';

export type BuildResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'not-buildable' | 'cell-occupied' | 'not-enough-gold' };

export type UpgradeResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' | 'already-upgraded' | 'not-enough-gold' };

export type SellResult =
  | { ok: true; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' };

export type TargetingResult = { ok: true } | { ok: false; reason: 'game-over' | 'no-tower' };

export type MoveResult =
  | { ok: true; tower: Tower }
  | { ok: false; reason: 'game-over' | 'not-in-setup' | 'no-tower' | 'locked' | 'not-buildable' | 'cell-occupied' };

export type UndoUpgradeResult =
  | { ok: true; tower: Tower; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'not-in-setup' | 'no-tower' | 'nothing-to-undo' };

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
  const setup = state.phase === 'setup';
  const tower: Tower = {
    cell: { col: cell.col, row: cell.row },
    type,
    upgraded: false,
    targeting: 'first',
    cooldownTicks: 0,
    spent: cost,
    locked: !setup,
    unlockedSpend: setup ? cost : 0,
    upgradedThisPhase: false,
  };
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
  if (state.phase === 'setup') {
    tower.unlockedSpend += cost;
    tower.upgradedThisPhase = true;
  }
  state.events.push({ kind: 'upgrade', cell: { col: tower.cell.col, row: tower.cell.row }, tower: tower.type });
  return { ok: true, tower, gold: state.gold };
}

/**
 * Sell the tower on `cell` for towerSellValue: an unlocked tower (built this
 * setup phase) refunds everything spent on it; a locked one refunds an
 * upgrade bought this setup phase in full plus sellRefund (70%, rounded
 * down) of the rest, in any phase. One `sell` event, `full` only when the
 * tower was unlocked.
 */
export function sellTower(state: GameState, cell: Cell): SellResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  const full = !tower.locked;
  const refund = towerSellValue(tower);
  state.gold += refund;
  state.towers = state.towers.filter((t) => t !== tower);
  state.events.push({ kind: 'sell', cell: { col: tower.cell.col, row: tower.cell.row }, tower: tower.type, refund, full });
  return { ok: true, refund, gold: state.gold };
}

/**
 * Move an unlocked tower to another buildable cell, in setup only
 * (milestone 25a). Free; keeps type, upgrade, targeting and spend. Checked
 * in order: game over, not in setup, no tower on `from`, locked, then `to`
 * as for a build (not buildable, occupied). Moving onto itself succeeds and
 * changes nothing.
 */
export function moveTower(state: GameState, from: Cell, to: Cell): MoveResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  const tower = towerAt(state, from);
  if (!tower) return { ok: false, reason: 'no-tower' };
  if (tower.locked) return { ok: false, reason: 'locked' };
  if (sameCell(from, to)) return { ok: true, tower };
  if (!isBuildableTerrain(to)) return { ok: false, reason: 'not-buildable' };
  if (towerAt(state, to)) return { ok: false, reason: 'cell-occupied' };
  const old = { col: tower.cell.col, row: tower.cell.row };
  tower.cell = { col: to.col, row: to.row };
  state.towers.sort((a, b) => cellKey(a.cell) - cellKey(b.cell));
  state.events.push({ kind: 'move', from: old, to: { col: to.col, row: to.row }, tower: tower.type });
  return { ok: true, tower };
}

/**
 * Undo an upgrade bought during the current setup phase (milestone 25a):
 * refunds the full upgrade cost and reverts the tower to base. Works on a
 * locked tower too (the tower stays locked).
 */
export function undoUpgrade(state: GameState, cell: Cell): UndoUpgradeResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  if (!tower.upgraded || !tower.upgradedThisPhase) return { ok: false, reason: 'nothing-to-undo' };
  const refund = TOWER_DEFS[tower.type].upgradeCost;
  state.gold += refund;
  tower.upgraded = false;
  tower.upgradedThisPhase = false;
  tower.spent -= refund;
  tower.unlockedSpend -= refund;
  state.events.push({ kind: 'undoUpgrade', cell: { col: tower.cell.col, row: tower.cell.row }, tower: tower.type, refund });
  return { ok: true, tower, refund, gold: state.gold };
}

/**
 * Set the targeting mode of the tower on `cell` (milestone 24). Refused when
 * the game is over or no tower stands there. Setting the mode it already has
 * still succeeds and emits the event.
 */
export function setTargeting(state: GameState, cell: Cell, mode: TargetingMode): TargetingResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  tower.targeting = mode;
  state.events.push({ kind: 'targeting', cell: { col: tower.cell.col, row: tower.cell.row }, mode });
  return { ok: true };
}
