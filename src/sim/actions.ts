// Player actions: build, upgrade, sell, and setTargeting (milestone 24).
// Allowed in 'setup' and 'wave' (DESIGN.md: "at any time, including
// mid-wave"), refused once the game is
// won or lost. Milestone 25a adds the planning phase: moveTower and
// undoUpgrade work only in 'setup' (see DESIGN.md "Planning phase"). Each
// mutates the state in place and returns a typed result. Milestone 25b adds
// useSpecial, during a wave only (see specials.ts and DESIGN.md "Special
// attacks").
// A successful action appends its event (build, upgrade, sell, targeting,
// move, undoUpgrade, special, cheat) to state.events, where it stays until the next tick
// clears the list.

import {
  BARRICADE_HP, GUARD_ATTACK_DPS, GUARD_HP, GUARD_LIFETIME_TICKS,
  barricadePlacement, guardsPlacement, type BarricadePlacementRefusal,
} from './blockers';
import { BOONS, boonScale, type BoonId } from './boons';
import { applyBurn, applySpecialSlow, enemyPosition, removeDead } from './combat';
import { FEATHERS, featherEnemy } from './feathers';
import { cellKey, sameCell, terrainBlock, type Cell } from './grid';
import { specialAllowed, SPECIAL_DEFS, spendSpecialCharge, ZONE_LINGER_TICKS, specialRadius, tarLingerTicks, type SpecialType } from './specials';
import { TOWER_DEFS, TOWER_PATHS, allowedTowers, atTowerCap, towerBuildCost, maxTowerLevel, towerLevel, towerSellValue, towerUndoValue } from './towers';
import type { GameState, Guard, Point, TargetingMode, Tower, TowerType, UpgradePath } from './types';

export type BuildResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'tower-locked' | 'tower-cap' | 'not-buildable' | 'water' | 'cell-occupied' | 'not-enough-gold' };

export type UpgradeResult =
  | { ok: true; tower: Tower; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' | 'already-upgraded' | 'not-level-2' | 'invalid-path' | 'max-level' | 'not-enough-gold' };

export type SellResult =
  | { ok: true; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'no-tower' };

export type TargetingResult = { ok: true } | { ok: false; reason: 'game-over' | 'no-tower' };

export type MoveResult =
  | { ok: true; tower: Tower }
  | { ok: false; reason: 'game-over' | 'not-in-setup' | 'no-tower' | 'locked' | 'not-buildable' | 'water' | 'cell-occupied' };

export type UndoUpgradeResult =
  | { ok: true; tower: Tower; refund: number; gold: number }
  | { ok: false; reason: 'game-over' | 'not-in-setup' | 'no-tower' | 'nothing-to-undo' };

export type SpecialResult =
  | { ok: true; hits: number; kills: number; gold: number }
  | { ok: false; reason: 'game-over' | 'not-in-wave' | 'locked' | 'no-charge' | BarricadePlacementRefusal };

function isOver(state: GameState): boolean {
  return state.phase === 'won' || state.phase === 'lost';
}

/** The refusal for building on `cell` on the game's map: 'water', 'not-buildable', or undefined for buildable terrain. */
function terrainRefusal(state: GameState, cell: Cell): 'water' | 'not-buildable' | undefined {
  const block = terrainBlock(cell, state.map);
  if (block === undefined) return undefined;
  return block === 'water' ? 'water' : 'not-buildable';
}

export function towerAt(state: GameState, cell: Cell): Tower | undefined {
  return state.towers.find((t) => sameCell(t.cell, cell));
}

/**
 * Build on `cell`. Refused when the game is over, the cell is outside the
 * grid, on the path strip, on a landmark or not an integer cell
 * ('not-buildable'), in water ('water', milestone 27), already holds a
 * tower, or gold is short, checked in that order.
 */
export function buildTower(state: GameState, cell: Cell, type: TowerType): BuildResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (!allowedTowers(state).includes(type)) return { ok: false, reason: 'tower-locked' };
  const block = terrainRefusal(state, cell);
  if (block) return { ok: false, reason: block };
  if (towerAt(state, cell)) return { ok: false, reason: 'cell-occupied' };
  if (atTowerCap(state)) return { ok: false, reason: 'tower-cap' };
  const cost = towerBuildCost(state, type);
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
    kills: 0,
  };
  if (state.towersBuilt !== undefined) state.towersBuilt++;
  state.towers.push(tower);
  state.towers.sort((a, b) => cellKey(a.cell) - cellKey(b.cell));
  state.events.push({ kind: 'build', cell: { col: cell.col, row: cell.row }, tower: type });
  return { ok: true, tower, gold: state.gold };
}

export function upgradeTower(state: GameState, cell: Cell, path?: UpgradePath): UpgradeResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  const level = towerLevel(tower);
  if (level >= maxTowerLevel(state)) return { ok: false, reason: 'max-level' };
  if (path === undefined && level === 2) return { ok: false, reason: 'already-upgraded' };
  if (path !== undefined) {
    if (level !== 2) return { ok: false, reason: 'not-level-2' };
    if (path !== 'A' && path !== 'B') return { ok: false, reason: 'invalid-path' };
  }
  const cost = path === undefined ? TOWER_DEFS[tower.type].upgradeCost : TOWER_PATHS[tower.type].cost;
  if (state.gold < cost) return { ok: false, reason: 'not-enough-gold' };
  state.gold -= cost;
  tower.upgraded = true;
  if (path !== undefined) tower.path = path;
  tower.spent += cost;
  if (state.phase === 'setup') {
    tower.unlockedSpend += cost;
    tower.upgradedThisPhase = true;
  }
  const event = { kind: 'upgrade', cell: { ...tower.cell }, tower: tower.type } as const;
  state.events.push(path === undefined ? { ...event, level: 2 } : { ...event, level: 3, path });
  return { ok: true, tower, gold: state.gold };
}

/**
 * Sell the tower on `cell` for towerSellValue: an unlocked tower (built this
 * setup phase) refunds everything spent on it; a locked one refunds
 * all upgrades bought this setup phase in full plus sellRefund (70%, rounded
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
  // Kill counts (milestone 25c): its burns no longer count for anyone, so a
  // tower built later on the same cell does not inherit them.
  for (const enemy of state.enemies) if (enemy.burnOwner && sameCell(enemy.burnOwner, tower.cell)) delete enemy.burnOwner;
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
  const block = terrainRefusal(state, to);
  if (block) return { ok: false, reason: block };
  if (towerAt(state, to)) return { ok: false, reason: 'cell-occupied' };
  const old = { col: tower.cell.col, row: tower.cell.row };
  tower.cell = { col: to.col, row: to.row };
  state.towers.sort((a, b) => cellKey(a.cell) - cellKey(b.cell));
  state.events.push({ kind: 'move', from: old, to: { col: to.col, row: to.row }, tower: tower.type });
  return { ok: true, tower };
}

/**
 * Undo an upgrade bought during the current setup phase (milestone 25a):
 * refunds the latest upgrade's cost and reverts one level. Works on a
 * locked tower too (the tower stays locked).
 */
export function undoUpgrade(state: GameState, cell: Cell): UndoUpgradeResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  const tower = towerAt(state, cell);
  if (!tower) return { ok: false, reason: 'no-tower' };
  const refund = towerUndoValue(tower);
  if (refund === 0) return { ok: false, reason: 'nothing-to-undo' };
  state.gold += refund;
  tower.upgraded = towerLevel(tower) === 3;
  delete tower.path;
  tower.spent -= refund;
  tower.unlockedSpend -= refund;
  // After removing the path price, setup spend still includes any refundable
  // first upgrade. For an unlocked tower it also includes the build price.
  const buildCost = tower.locked ? 0 : TOWER_DEFS[tower.type].cost;
  tower.upgradedThisPhase = tower.upgraded && tower.unlockedSpend > buildCost;
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

/**
 * Use a special attack aimed at `point` (milestone 25b; reworked in
 * milestone 30). Refused, checked in this order, when the game is over,
 * outside a wave ('not-in-wave'), when `type` is not unlocked on this wave
 * ('locked'), when the charge is not ready or a special already fired this
 * tick ('no-charge'), or when the point is outside the map ('out-of-bounds').
 * Barricade and Guards must also pass their trail snap and endpoint checks.
 * Each replaces blockers from its own prior cast and affects enemies on contact.
 * Otherwise it spends the charge, starts the recharge
 * for that special and acts at once on every live enemy
 * whose position is within the special's radius of the point (inclusive),
 * flying or not: the keg's damage at full strength (shields ignored); the
 * Tar Barrel's special slow or the Fire Arrows' special burn. A Tar Barrel
 * on a feather-barrel level feathers eligible enemies on impact. The Tar Barrel and Fire Arrows
 * then leave a zone at the point for `zoneTicks` (game.ts step 2b). Emits
 * one `special` event with the number of enemies hit (and the zone's id),
 * then `slowed` events for applied slows, then a `kill` (cause 'special')
 * for each enemy it killed, which pays its bounty and is removed at once.
 */
export function useSpecial(state: GameState, type: SpecialType, point: Point): SpecialResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  if (state.phase !== 'wave') return { ok: false, reason: 'not-in-wave' };
  if (!specialAllowed(state, type)) return { ok: false, reason: 'locked' };
  if (state.specialCharges <= 0 || state.lastSpecialTick === state.tick) {
    return { ok: false, reason: 'no-charge' };
  }
  const { x, y } = point;
  const squad = type === 'guards' ? guardsPlacement(state.map, point) : undefined;
  const placement = type === 'barricade' ? barricadePlacement(state.map, point) : squad;
  if (placement) {
    if (!placement.ok) return { ok: false, reason: placement.reason };
  } else if (!(x >= 0 && x <= state.map.width && y >= 0 && y <= state.map.height)) {
    return { ok: false, reason: 'out-of-bounds' };
  }
  spendSpecialCharge(state, type);
  if (placement) {
    const { point: trail } = placement;
    state.events.push({ kind: 'special', type, x: trail.x, y: trail.y, angle: trail.angle, radius: 0, hits: 0 });
    if (squad?.ok) {
      const replaced = state.blockers.filter((blocker) => blocker.kind === 'guard');
      if (replaced.length) state.events.push({ kind: 'squadGone', guards: replaced, reason: 'replaced' });
      const guards = squad.points.map((point): Guard => ({
        ...point, kind: 'guard', id: state.nextGuardId++, hp: GUARD_HP, maxHp: GUARD_HP,
        attackDps: GUARD_ATTACK_DPS, ticksLeft: GUARD_LIFETIME_TICKS,
      }));
      state.blockers = [...state.blockers.filter((blocker) => blocker.kind !== 'guard'), ...guards];
      state.events.push({ kind: 'squadPlaced', guards: guards.map((guard) => ({ ...guard })) });
    } else {
      state.blockers = state.blockers.filter((blocker) => blocker.kind !== 'barricade');
      state.blockers.push({ ...trail, kind: 'barricade', hp: BARRICADE_HP, maxHp: BARRICADE_HP });
    }
    return { ok: true, hits: 0, kills: 0, gold: state.gold };
  }
  const def = SPECIAL_DEFS[type];
  const radius = specialRadius(type, state.boons);
  const inside = state.enemies.filter((enemy) => {
    const p = enemyPosition(enemy, state.map);
    return Math.hypot(p.x - x, p.y - y) <= radius;
  });
  const zoneType = type === 'tarBarrel' || type === 'fireArrows' ? type : undefined;
  const zoneId = zoneType !== undefined && def.zoneTicks > 0 ? state.nextZoneId : undefined;
  state.events.push({ kind: 'special', type, x, y, radius, hits: inside.length, ...(zoneId === undefined ? {} : { zoneId }) });
  for (const enemy of inside) {
    if (def.damage > 0) enemy.hp -= def.damage;
    if (def.slow > 0) {
      const ticks = tarLingerTicks(state.boons);
      const applied = applySpecialSlow(enemy, def.slow, ticks);
      if (applied !== null) state.events.push({ kind: 'slowed', enemyId: enemy.id, slow: applied, ticks });
    }
    if (type === 'tarBarrel' && state.level?.featherBarrels) featherEnemy(state, enemy, FEATHERS.barrelRunTicks);
    if (def.burnDps > 0) applyBurn(enemy, boonScale(def.burnDps, state.boons, 'hotCoals'), ZONE_LINGER_TICKS, 'special');
  }
  if (zoneId !== undefined && zoneType !== undefined) {
    state.zones.push({ id: zoneId, type: zoneType, x, y, radius, ticksLeft: def.zoneTicks });
    state.nextZoneId += 1;
  }
  const before = state.enemies.length;
  removeDead(state, 'special');
  return { ok: true, hits: inside.length, kills: before - state.enemies.length, gold: state.gold };
}

/** Gold the cheat grants (milestone 30). */
export const CHEAT_GOLD = 500;

export type CheatResult = { ok: true; gold: number } | { ok: false; reason: 'game-over' };

/**
 * The gold cheat (milestone 30), between ticks: +CHEAT_GOLD gold, sets
 * `state.cheated` and emits `cheat`. Refused with 'game-over' once the game
 * is won or lost; a refusal changes nothing. The mark lifts campaign locks.
 */
export function grantCheatGold(state: GameState): CheatResult {
  if (isOver(state)) return { ok: false, reason: 'game-over' };
  state.gold += CHEAT_GOLD;
  state.cheated = true;
  state.events.push({ kind: 'cheat', gold: CHEAT_GOLD });
  return { ok: true, gold: state.gold };
}

export function pickBoon(state: GameState, id: BoonId): { ok: true } | { ok: false; reason: 'no-boon-pending' | 'boon-not-offered' } {
  const offer = state.pendingBoon;
  if (!offer) return { ok: false, reason: 'no-boon-pending' };
  if (!offer.options.includes(id)) return { ok: false, reason: 'boon-not-offered' };
  state.boons = [...state.boons, id];
  if (id === 'warChest') state.gold += BOONS.warChest.value;
  if (id === 'stoneWalls') state.lives += BOONS.stoneWalls.value;
  state.pendingBoon = null;
  state.events.push({ kind: 'boonPicked', wave: offer.wave, id });
  return { ok: true };
}
