import type { MapId } from './map';
import type { SpecialType } from './specials';
import type { TowerLevel, TowerType, WaveDef } from './types';

export const CAMPAIGN_START_LIVES = 20;
export const TWO_STAR_LIVES = 12;
export const THREE_STAR_LIVES = 18;

export interface LevelTaxes {
  readonly windowTax?: number;   // Extra share of base cost per previous build
  readonly frozenPurse?: number; // Total gold per wave clear
  readonly forcedMarch?: number; // Extra share of normal movement speed
  readonly curfew?: number;      // Share removed from maximum tower range
  readonly noLoitering?: number; // Seconds of setup between waves
  readonly rationing?: number;   // Towers standing
}
export type TaxKind = keyof LevelTaxes;

export type LevelFeat =
  | { readonly kind: 'noLeaks' }
  | { readonly kind: 'noSpecials' }
  | { readonly kind: 'maxTowers'; readonly limit: number };

export interface LevelDef {
  readonly taxes?: LevelTaxes;
  readonly feat?: LevelFeat;
  readonly id: number;
  readonly map: MapId;
  readonly endingBoss?: 'boss' | 'grumblemaw';
  readonly waves: readonly WaveDef[];
  readonly startGold: number;
  readonly hpScale: number;
  /** First wave with an HP growth step, or null for fixed HP. */
  readonly hpGrowthStart: number | null;
  readonly allowedTowers: readonly TowerType[];
  readonly maxTowerLevel: TowerLevel;
  readonly allowedSpecials: readonly SpecialType[];
  /** Waves in ascending order, paired with Free play reward menus in order. */
  readonly rewardWaves: readonly number[];
}
