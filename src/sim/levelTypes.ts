import type { MapId } from './map';
import type { SpecialType } from './specials';
import type { TowerLevel, TowerType, WaveDef } from './types';

export interface LevelDef {
  readonly id: number;
  readonly map: MapId;
  readonly waves: readonly WaveDef[];
  readonly startGold: number;
  readonly startLives: number;
  readonly hpScale: number;
  /** First wave with an HP growth step, or null for fixed HP. */
  readonly hpGrowthStart: number | null;
  readonly allowedTowers: readonly TowerType[];
  readonly maxTowerLevel: TowerLevel;
  readonly allowedSpecials: readonly SpecialType[];
  /** Waves in ascending order, paired with Free play reward menus in order. */
  readonly rewardWaves: readonly number[];
  readonly stars: { readonly two: number; readonly three: number };
}
