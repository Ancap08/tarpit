// Special attacks (milestone 25b, reworked in milestone 30,
// docs/SCOPE-v5.md "Specials rework").
// One shared charge, recharging in wave time. A feather-barrel wait carries across
// waves and pauses in setup. Other specials refill at a wave start. The player aims a
// special at a map point; it acts at once, between ticks, like a build. The
// Tar Barrel and Fire Arrows also leave a ground zone at the point for
// `zoneTicks` (game.ts zonesStep). Specials hit flying enemies and ignore
// shields. The radius is measured from the aimed point to the enemy
// position, inclusive.

import { boonScale, type BoonId } from './boons';
import type { GameState } from './types';

export type SpecialType = 'keg' | 'barricade' | 'tarBarrel' | 'guards' | 'fireArrows';

export interface SpecialDef {
  /** The first wave (1-based, state.wave) on which this special can be used. */
  unlockWave: number;
  /** Pixels from the aimed point to the enemy position, inclusive. */
  radius: number;
  /** Damage to every enemy in the radius when it lands (shields ignored); 0 for none. */
  damage: number;
  /** Slow strength in [0, 1) (boss cap applies); 0 for none. */
  slow: number;
  /** Burn damage per second (existing burn rules); 0 for none. */
  burnDps: number;
  /** Ticks the ground zone lasts; 0 for no zone (the Powder Keg). */
  zoneTicks: number;
}

/**
 * Ticks a zone's slow or burn lasts on an enemy after it last stood in the
 * zone (milestone 30): every zone tick sets the slow or burn to this many
 * ticks on each enemy inside, so it acts while the enemy is inside and for
 * this long after it leaves.
 */
export const ZONE_LINGER_TICKS = 60;

/** Wave ticks for an ordinary refill and for the longer wait after a feather barrel. */
export const SPECIAL_RECHARGE_TICKS = 1200;
export const BARREL_RECHARGE_TICKS = 3034;

export function ordinaryRechargeTicks(held: readonly BoonId[]): number {
  return Math.round(boonScale(SPECIAL_RECHARGE_TICKS, held, 'quickHands'));
}

/** Shared by real casts and the headless control that rests on the barrel's turn. */
export function spendSpecialCharge(state: GameState, type: SpecialType): void {
  state.specialCharges = 0;
  state.lastSpecialTick = state.tick;
  if (type === 'tarBarrel' && state.level?.featherBarrels) {
    state.specialRechargeTicks = Math.round(boonScale(BARREL_RECHARGE_TICKS, state.boons, 'quickHands'));
    state.barrelRecharge = { totalTicks: state.specialRechargeTicks };
  } else {
    state.specialRechargeTicks = ordinaryRechargeTicks(state.boons);
    delete state.barrelRecharge;
  }
}

/** An outstanding barrel wait carries into the new wave on every kind of start. */
export function refillAtWaveStart(state: GameState): void {
  if (state.barrelRecharge && state.specialRechargeTicks > 0) return;
  state.specialRechargeTicks = 0;
  state.specialCharges = state.level?.allowedSpecials.length === 0 && !state.cheated ? 0 : 1;
  delete state.barrelRecharge;
}

/**
 * Milestone 30 numbers. Radii are SCOPE-v5's starting numbers (keg 70 ->
 * 90, tar 90 -> 100, fire 80 -> 90). Balance pass: zones 300 -> 480 ticks
 * (8 s; at 5 s the combo was not 3 lives better than without specials on
 * Meadow and hardBuild lost Hard on Riverbend), keg damage 80 -> 30 (at 80
 * a keg kills Harpies, so noAntiAir no longer leaked 75% of wave 4's,
 * target T7), Fire Arrows 30 -> 20 burn per second (at 30 the combo did
 * better with no Tar Barrel, target S2). Before milestone 30 the tar slow
 * lasted 210 ticks and the fire burn 240, with no zones.
 */
export const SPECIAL_DEFS: Readonly<Record<SpecialType, SpecialDef>> = {
  keg: { unlockWave: 1, radius: 90, damage: 60, slow: 0, burnDps: 0, zoneTicks: 0 },
  barricade: { unlockWave: 3, radius: 0, damage: 0, slow: 0, burnDps: 0, zoneTicks: 0 },
  tarBarrel: { unlockWave: 4, radius: 100, damage: 0, slow: 0.5, burnDps: 0, zoneTicks: 660 },
  guards: { unlockWave: 6, radius: 0, damage: 0, slow: 0, burnDps: 0, zoneTicks: 0 },
  fireArrows: { unlockWave: 7, radius: 90, damage: 0, slow: 0, burnDps: 26, zoneTicks: 660 },
};

/** Every special, in unlock order (the HUD popup lists them in this order). */
export const SPECIAL_TYPES: readonly SpecialType[] = ['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows'];

/** Whether `type` is unlocked on `wave` (the current or last wave, state.wave). */
export function isSpecialUnlocked(type: SpecialType, wave: number): boolean {
  return wave >= SPECIAL_DEFS[type].unlockWave;
}

/** The specials unlocked on `wave`, in unlock order. */
export function unlockedSpecials(wave: number): SpecialType[] {
  return SPECIAL_TYPES.filter((type) => isSpecialUnlocked(type, wave));
}

type SpecialRules = Pick<GameState, 'level' | 'wave'> & Partial<Pick<GameState, 'cheated'>>;

/** A campaign grants its list on wave 1; the cheat adds the normal wave unlocks. */
export function specialAllowed(state: SpecialRules, type: SpecialType): boolean {
  if (state.level?.allowedSpecials.includes(type)) return state.wave >= 1;
  return (!state.level || state.cheated === true) && isSpecialUnlocked(type, state.wave);
}

export function availableSpecials(state: SpecialRules): SpecialType[] {
  return SPECIAL_TYPES.filter((type) => specialAllowed(state, type));
}

/** Effective radius for both the actual impact and the headless player's aim. */
export function specialRadius(type: SpecialType, held: readonly BoonId[]): number {
  return type === 'keg' ? boonScale(SPECIAL_DEFS[type].radius, held, 'biggerBlasts') : SPECIAL_DEFS[type].radius;
}

export function tarLingerTicks(held: readonly BoonId[]): number {
  return Math.round(boonScale(ZONE_LINGER_TICKS, held, 'stickyTar'));
}
