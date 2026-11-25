import type { LevelMapId } from './map';
import type { Cell } from './grid';
import type { SpecialType } from './specials';
import type { Point, TowerLevel, TowerType, WaveDef } from './types';

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
  | { readonly kind: 'unbroken' }
  | { readonly kind: 'noRepairs' }
  | { readonly kind: 'maxTowers'; readonly limit: number };

export interface GateDef {
  readonly maxHp: number;
  readonly repairCost: number;
  readonly repairHp: number;
  /** Trail pixels from the gate to the exit. */
  readonly yardLength: number;
}

export interface PillowWindowDef {
  readonly position: Point;
  readonly road?: string;
  /** Inclusive distances along this road, in trail pixels from its entrance. */
  readonly from: number;
  readonly to: number;
}

export type WallSiteTax =
  | { readonly kind: 'quartering'; readonly site: Cell; readonly price: number }
  | { readonly kind: 'royalSurvey'; readonly site: Cell };

export interface SiegeDef {
  readonly windows?: readonly PillowWindowDef[];
  readonly wallSiteTax?: WallSiteTax;
}

export interface LevelDef extends SiegeDef {
  readonly gate?: GateDef;
  readonly featherBarrels?: boolean;
  readonly taxes?: LevelTaxes;
  readonly feat?: LevelFeat;
  readonly id: number;
  readonly map: LevelMapId;
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
