import type { Enemy, EnemyStats, EnemyType } from './types';

/** Enemy stats from docs/DESIGN.md. Speed is pixels per second. */
export const ENEMY_STATS: Readonly<Record<EnemyType, EnemyStats>> = {
  goblin: { hp: 30, speed: 60, bounty: 4, flying: false, shield: false, livesCost: 1 },
  wolf: { hp: 28, speed: 120, bounty: 5, flying: false, shield: false, livesCost: 1 },
  troll: { hp: 700, speed: 35, bounty: 8, flying: false, shield: false, livesCost: 1 },
  harpy: { hp: 40, speed: 90, bounty: 7, flying: true, shield: false, livesCost: 1 },
  shieldbearer: { hp: 120, speed: 45, bounty: 9, flying: false, shield: true, livesCost: 1 },
  // Grumblefoot, the Troll King (milestone 23, docs/SCOPE-v4.md): one at the
  // end of wave 10; costs 5 lives if he exits; slows cap at 30% on him.
  boss: { hp: 4000, speed: 25, bounty: 150, flying: false, shield: false, livesCost: 5, slowCap: 0.3 },
};

/** The boss's type (milestone 23). */
export const BOSS_TYPE = 'boss' satisfies EnemyType;

/** Whether this enemy is the boss. */
export function isBoss(enemy: Pick<Enemy, 'type'>): boolean {
  return enemy.type === BOSS_TYPE;
}

/** The slow strength this enemy actually takes from a slow of `slow`: capped by its slowCap. */
export function cappedSlow(enemy: Pick<Enemy, 'type'>, slow: number): number {
  const cap = ENEMY_STATS[enemy.type].slowCap;
  return cap === undefined ? slow : Math.min(slow, cap);
}

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
