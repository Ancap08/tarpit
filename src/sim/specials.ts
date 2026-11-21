// Special attacks (milestone 25b, docs/SCOPE-v4.md "Special attacks (25b)").
// One charge per wave: startWave grants it, a wave clear takes it away
// (unused charges do not carry over). The player aims a special at a map
// point; it acts at once, between ticks, like a build. Specials hit flying
// enemies (unlike the ground-only towers, Harpies can be slowed and burned
// by a special) and ignore shields (full damage). The radius is measured
// from the aimed point to the enemy position, inclusive.

export type SpecialType = 'keg' | 'tarBarrel' | 'fireArrows';

export interface SpecialDef {
  /** The first wave (1-based, state.wave) on which this special can be used. */
  unlockWave: number;
  /** Pixels from the aimed point to the enemy position, inclusive. */
  radius: number;
  /** Damage to every enemy in the radius (shields ignored); 0 for none. */
  damage: number;
  /** Slow strength in [0, 1) (boss cap applies); 0 for none. */
  slow: number;
  slowTicks: number;
  /** Burn damage per second (existing burn rules); 0 for none. */
  burnDps: number;
  burnTicks: number;
}

/** Starting numbers from SCOPE-v4; milestones 25c and 28 retune. */
export const SPECIAL_DEFS: Readonly<Record<SpecialType, SpecialDef>> = {
  keg: { unlockWave: 1, radius: 70, damage: 80, slow: 0, slowTicks: 0, burnDps: 0, burnTicks: 0 },
  tarBarrel: { unlockWave: 4, radius: 90, damage: 0, slow: 0.5, slowTicks: 240, burnDps: 0, burnTicks: 0 },
  fireArrows: { unlockWave: 7, radius: 80, damage: 0, slow: 0, slowTicks: 0, burnDps: 10, burnTicks: 240 },
};

/** Every special, in unlock order (the HUD popup lists them in this order). */
export const SPECIAL_TYPES: readonly SpecialType[] = ['keg', 'tarBarrel', 'fireArrows'];

/** Whether `type` is unlocked on `wave` (the current or last wave, state.wave). */
export function isSpecialUnlocked(type: SpecialType, wave: number): boolean {
  return wave >= SPECIAL_DEFS[type].unlockWave;
}

/** The specials unlocked on `wave`, in unlock order. */
export function unlockedSpecials(wave: number): SpecialType[] {
  return SPECIAL_TYPES.filter((type) => isSpecialUnlocked(type, wave));
}
