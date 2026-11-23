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
  // Milestone 25c: Easy lives 25 -> 30; milestone 28: 30 -> 35 (Easy
  // lazyBuild wins with at least 8 lives, target E1). Hard hp 1.3 -> 1.2 (25c second pass;
  // 1.1 in the first). Every Hard hp avoids 1 or 2 over a multiple of a
  // tower's base damage: 12, 4, 25 and 45 (docs/DESIGN.md, Hard hp rule).
  easy: { hpMultiplier: 0.75, startGold: 150, startLives: 35 },
  normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
  hard: { hpMultiplier: 1.2, startGold: 80, startLives: 15 },
};

/**
 * An enemy's hp at spawn (and so its full hp) on this level: the base hp
 * times the level's multiplier, rounded to a whole number (Goblin 23:
 * Easy 17, Normal 23, Hard 28). Endless waves (milestone 26) pass their
 * `waveMultiplier` (1.8 ^ cycle), applied before the one rounding:
 * round(base x level x wave), so a Normal wave 21 Goblin has
 * round(23 x 1.8) = 41.
 */
export function enemyMaxHp(type: EnemyType, difficulty: Difficulty = DEFAULT_DIFFICULTY, waveMultiplier = 1): number {
  return Math.round(ENEMY_STATS[type].hp * DIFFICULTY_DEFS[difficulty].hpMultiplier * waveMultiplier);
}
