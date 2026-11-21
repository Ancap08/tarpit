// Difficulty levels (milestone 25, docs/SCOPE-v4.md "Difficulty"). A level
// scales enemy hp at spawn and sets the starting gold and lives. Bounties,
// speeds, towers and waves do not change. Normal is the game as it was
// before milestone 25: multiplier 1, 100 gold, 20 lives.

import { ENEMY_STATS } from './enemies';
import type { EnemyType } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

/** Every level, in title menu order. */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export interface DifficultyDef {
  /** Enemy hp at spawn is round(base hp x this). */
  hpMultiplier: number;
  startGold: number;
  startLives: number;
}

export const DIFFICULTY_DEFS: Readonly<Record<Difficulty, DifficultyDef>> = {
  easy: { hpMultiplier: 0.75, startGold: 150, startLives: 25 },
  normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
  hard: { hpMultiplier: 1.3, startGold: 80, startLives: 15 },
};

/**
 * An enemy's hp at spawn (and so its full hp) on this level: the base hp
 * times the level's multiplier, rounded to a whole number (Goblin 30:
 * Easy 23, Normal 30, Hard 39).
 */
export function enemyMaxHp(type: EnemyType, difficulty: Difficulty = DEFAULT_DIFFICULTY): number {
  return Math.round(ENEMY_STATS[type].hp * DIFFICULTY_DEFS[difficulty].hpMultiplier);
}
