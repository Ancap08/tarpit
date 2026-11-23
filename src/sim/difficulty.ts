// Difficulty levels (milestone 25, docs/SCOPE-v4.md "Difficulty"). A level
// scales enemy hp at spawn and sets the starting gold and lives. Bounties,
// speeds, towers and waves do not change. Normal is the game as it was
// before milestone 25: multiplier 1, 100 gold, 20 lives.

import { ENEMY_STATS } from './enemies';
import { ACT_ONE_LAST_WAVE, LAST_WAVE } from './waves';
import type { EnemyType } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Every level, in title menu order. */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export interface DifficultyDef {
  /** Base HP multiplier, before wave and endless growth. */
  hpMultiplier: number;
  startGold: number;
  startLives: number;
}

export const DIFFICULTY_DEFS: Readonly<Record<Difficulty, DifficultyDef>> = {
  // Milestone 25c: Easy lives 25 -> 30; milestone 28: 30 -> 35 (Easy
  // lazyBuild wins with at least 8 lives, target E1). Hard hp 1.3 -> 1.2 (25c second pass;
  // 1.1 in the first). Every Hard hp avoids 1 or 2 over a multiple of a
  // tower's base damage: 12, 4, 25 and 45 (docs/DESIGN.md, Hard hp rule).
  easy: { hpMultiplier: 0.75, startGold: 150, startLives: 35 },
  normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
  hard: { hpMultiplier: 1.2, startGold: 80, startLives: 15 },
};

/** Each act-two wave gains another power. Endless carries all ten powers forward. */
export const ACT_TWO_HP_GROWTH: Readonly<Record<Difficulty, number>> = { easy: 1, normal: 1.13, hard: 1.12 };

export function campaignHpFactor(wave: number, difficulty: Difficulty): number {
  const steps = Math.max(0, Math.min(wave, LAST_WAVE) - ACT_ONE_LAST_WAVE);
  return ACT_TWO_HP_GROWTH[difficulty] ** steps;
}

/** All factors apply before rounding the final spawn hp once, half up. */
export function enemyMaxHp(type: EnemyType, difficulty: Difficulty = DEFAULT_DIFFICULTY, waveMultiplier = 1): number {
  return Math.round(ENEMY_STATS[type].hp * DIFFICULTY_DEFS[difficulty].hpMultiplier * waveMultiplier);
}
