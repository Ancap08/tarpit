// Special attacks (milestone 25b, reworked in milestone 30,
// docs/SCOPE-v5.md "Specials rework").
// One shared charge: it is ready when a wave starts (Start Wave or an early
// call); after a special is fired it is ready again SPECIAL_RECHARGE_TICKS
// of wave time later. It does not recharge in setup. The player aims a
// special at a map point; it acts at once, between ticks, like a build. The
// Tar Barrel and Fire Arrows also leave a ground zone at the point for
// `zoneTicks` (game.ts zonesStep). Specials hit flying enemies and ignore
// shields. The radius is measured from the aimed point to the enemy
// position, inclusive.

import { boonScale, type BoonId } from './boons';

export type SpecialType = 'keg' | 'barricade' | 'tarBarrel' | 'fireArrows';

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

/** Wave ticks from firing a special until the shared charge is ready again (milestone 30). */
export const SPECIAL_RECHARGE_TICKS = 1200;

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
  fireArrows: { unlockWave: 7, radius: 90, damage: 0, slow: 0, burnDps: 26, zoneTicks: 660 },
};

/** Every special, in unlock order (the HUD popup lists them in this order). */
export const SPECIAL_TYPES: readonly SpecialType[] = ['keg', 'barricade', 'tarBarrel', 'fireArrows'];

/** Whether `type` is unlocked on `wave` (the current or last wave, state.wave). */
export function isSpecialUnlocked(type: SpecialType, wave: number): boolean {
  return wave >= SPECIAL_DEFS[type].unlockWave;
}

/** The specials unlocked on `wave`, in unlock order. */
export function unlockedSpecials(wave: number): SpecialType[] {
  return SPECIAL_TYPES.filter((type) => isSpecialUnlocked(type, wave));
}

/** Effective radius for both the actual impact and the headless player's aim. */
export function specialRadius(type: SpecialType, held: readonly BoonId[]): number {
  return type === 'keg' ? boonScale(SPECIAL_DEFS[type].radius, held, 'biggerBlasts') : SPECIAL_DEFS[type].radius;
}

export function tarLingerTicks(held: readonly BoonId[]): number {
  return Math.round(boonScale(ZONE_LINGER_TICKS, held, 'stickyTar'));
}
