import type { EnemyStats, EnemyType } from './types';

/** Enemy stats from docs/DESIGN.md. Speed is pixels per second. */
export const ENEMY_STATS: Readonly<Record<EnemyType, EnemyStats>> = {
  goblin: { hp: 30, speed: 60, bounty: 5 },
  wolf: { hp: 20, speed: 120, bounty: 6 },
  troll: { hp: 150, speed: 35, bounty: 15 },
};
