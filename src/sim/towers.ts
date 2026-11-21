import type { Tower, TowerDef, TowerLevelStats, TowerType } from './types';

/** Tower stats from docs/DESIGN.md. Range and radius in pixels, slowDuration in seconds. */
export const TOWER_DEFS: Readonly<Record<TowerType, TowerDef>> = {
  musketeer: {
    cost: 50,
    upgradeCost: 40,
    base: { range: 110, damage: 12, fireRate: 1.0, splashRadius: 0, slow: 0, slowDuration: 0 },
    upgraded: { range: 125, damage: 20, fireRate: 1.0, splashRadius: 0, slow: 0, slowDuration: 0 },
  },
  cannon: {
    cost: 80,
    upgradeCost: 60,
    base: { range: 90, damage: 25, fireRate: 0.5, splashRadius: 40, slow: 0, slowDuration: 0 },
    upgraded: { range: 90, damage: 40, fireRate: 0.5, splashRadius: 50, slow: 0, slowDuration: 0 },
  },
  tarpit: {
    cost: 60,
    upgradeCost: 50,
    base: { range: 80, damage: 3, fireRate: 1.0, splashRadius: 0, slow: 0.4, slowDuration: 2 },
    upgraded: { range: 95, damage: 3, fireRate: 1.0, splashRadius: 0, slow: 0.55, slowDuration: 2 },
  },
};

/**
 * Sell refund: 70% of total spent, rounded down. Integer math on purpose:
 * 90 * 0.7 is 62.99999999999999 in floating point, which floors to 62.
 */
export function sellRefund(spent: number): number {
  return Math.floor((spent * 7) / 10);
}

/** The stats that apply to a tower at its current level. */
export function towerStats(tower: Pick<Tower, 'type' | 'upgraded'>): TowerLevelStats {
  const def = TOWER_DEFS[tower.type];
  return tower.upgraded ? def.upgraded : def.base;
}
