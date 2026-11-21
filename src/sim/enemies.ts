import type { EnemyStats, EnemyType } from './types';

/** Enemy stats from docs/DESIGN.md. Speed is pixels per second. */
export const ENEMY_STATS: Readonly<Record<EnemyType, EnemyStats>> = {
  goblin: { hp: 30, speed: 60, bounty: 4 },
  wolf: { hp: 28, speed: 120, bounty: 5 },
  troll: { hp: 500, speed: 35, bounty: 11 },
};
