import { boonScale, type BoonId } from './boons';
import { TICKS_PER_SECOND } from './time';
import type { Tower, TowerDef, TowerLevelStats, TowerType } from './types';

/** No minimum range, splash, slow or burn: fields a level overrides as needed. */
const PLAIN = { minRange: 0, splashRadius: 0, slow: 0, slowDuration: 0, burnDps: 0, burnDuration: 0 } as const;

/**
 * Tower stats from docs/DESIGN.md. Range and radii in pixels, durations in
 * seconds. Cooldown ticks are round(60 / fireRate), so the Mortar's 1/3 per
 * second gives 180.
 */
export const TOWER_DEFS: Readonly<Record<TowerType, TowerDef>> = {
  musketeer: {
    cost: 50,
    upgradeCost: 35,
    base: { ...PLAIN, range: 110, damage: 12, fireRate: 1.0 },
    upgraded: { ...PLAIN, range: 125, damage: 22, fireRate: 1.0 },
  },
  cannon: {
    cost: 80,
    upgradeCost: 60,
    base: { ...PLAIN, range: 105, damage: 25, fireRate: 0.5, splashRadius: 40 },
    upgraded: { ...PLAIN, range: 105, damage: 40, fireRate: 0.5, splashRadius: 55 },
  },
  tarpit: {
    cost: 60,
    upgradeCost: 50,
    base: { ...PLAIN, range: 90, damage: 3, fireRate: 2.0, slow: 0.4, slowDuration: 2 },
    upgraded: { ...PLAIN, range: 105, damage: 3, fireRate: 2.0, slow: 0.6, slowDuration: 2 },
  },
  longbow: {
    cost: 40,
    upgradeCost: 30,
    base: { ...PLAIN, range: 150, damage: 4, fireRate: 2.5 },
    upgraded: { ...PLAIN, range: 170, damage: 9, fireRate: 2.5 },
  },
  mortar: {
    cost: 110,
    upgradeCost: 80,
    base: { ...PLAIN, range: 220, minRange: 70, damage: 45, fireRate: 1 / 3, splashRadius: 60 },
    upgraded: { ...PLAIN, range: 220, minRange: 70, damage: 70, fireRate: 1 / 3, splashRadius: 70 },
  },
  firepot: {
    cost: 70,
    upgradeCost: 50,
    base: { ...PLAIN, range: 100, damage: 4, fireRate: 0.8, burnDps: 5, burnDuration: 3 },
    upgraded: { ...PLAIN, range: 100, damage: 4, fireRate: 0.8, burnDps: 8, burnDuration: 4 },
  },
};

/**
 * Sell refund: 70% of total spent, rounded down. Integer math on purpose:
 * 90 * 0.7 is 62.99999999999999 in floating point, which floors to 62.
 */
export function sellRefund(spent: number): number {
  return Math.floor((spent * 7) / 10);
}

/**
 * What selling `tower` pays now (milestone 25a). Unlocked (built this setup
 * phase): everything spent. Locked: the gold spent on it this setup phase
 * (an upgrade bought this phase) in full, plus sellRefund of the rest; so
 * the same as undoing that upgrade and then selling.
 */
export function towerSellValue(tower: Pick<Tower, 'locked' | 'spent' | 'unlockedSpend'>): number {
  if (!tower.locked) return tower.spent;
  return tower.unlockedSpend + sellRefund(tower.spent - tower.unlockedSpend);
}

/** The array of held boons is replaced at each pick. Cache the finite set of
 * level variants so targeting does not allocate a fresh stats object each tick. */
const boonStats = new WeakMap<readonly BoonId[], Map<TowerLevelStats, TowerLevelStats>>();

/** The stats that apply to a tower at its current level. */
export function towerStats(tower: Pick<Tower, 'type' | 'upgraded'>, held?: readonly BoonId[]): TowerLevelStats {
  const def = TOWER_DEFS[tower.type];
  const base = tower.upgraded ? def.upgraded : def.base;
  if (!held?.length) return base;
  let variants = boonStats.get(held);
  if (!variants) {
    variants = new Map();
    boonStats.set(held, variants);
  }
  const cached = variants.get(base);
  if (cached) return cached;
  const artillery = tower.type === 'mortar' || tower.type === 'cannon';
  const stats = {
    ...base,
    range: artillery ? boonScale(base.range, held, 'longBarrels') : base.range,
    damage: tower.type === 'longbow' ? boonScale(base.damage, held, 'keenArrows') : base.damage,
    slowDuration: boonScale(base.slowDuration, held, 'stickyTar'),
    burnDps: boonScale(base.burnDps, held, 'hotCoals'),
    fireRate: boonScale(base.fireRate, held, 'veteranCrews'),
    splashRadius: boonScale(base.splashRadius, held, 'biggerBlasts'),
  };
  variants.set(base, stats);
  return stats;
}

/** Ticks between shots at a level: round(60 / fireRate). */
export function shotCooldown(stats: TowerLevelStats): number {
  return Math.round(TICKS_PER_SECOND / stats.fireRate);
}
