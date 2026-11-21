import type { Enemy, EnemyStats, EnemyType } from './types';

/** Enemy stats from docs/DESIGN.md. Speed is pixels per second. */
export const ENEMY_STATS: Readonly<Record<EnemyType, EnemyStats>> = {
  goblin: { hp: 30, speed: 60, bounty: 4, flying: false, shield: false },
  wolf: { hp: 28, speed: 120, bounty: 5, flying: false, shield: false },
  troll: { hp: 700, speed: 35, bounty: 8, flying: false, shield: false },
  harpy: { hp: 40, speed: 90, bounty: 7, flying: true, shield: false },
  shieldbearer: { hp: 120, speed: 45, bounty: 9, flying: false, shield: true },
};

/** A shield halves shots whose base damage is this or less (docs/SCOPE-v4.md). */
export const SHIELD_THRESHOLD = 10;

/** Whether this enemy flies (read from its type's stats). */
export function isFlying(enemy: Pick<Enemy, 'type'>): boolean {
  return ENEMY_STATS[enemy.type].flying;
}

/**
 * Damage a shot of `baseDamage` actually deals to this enemy: half for a
 * shielded enemy when baseDamage <= SHIELD_THRESHOLD, else full.
 */
export function shotDamage(enemy: Pick<Enemy, 'type'>, baseDamage: number): number {
  return ENEMY_STATS[enemy.type].shield && baseDamage <= SHIELD_THRESHOLD ? baseDamage / 2 : baseDamage;
}
