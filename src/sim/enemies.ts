import type { Enemy, EnemyStats, EnemyType } from './types';

/**
 * Enemy stats from docs/DESIGN.md. Speed is pixels per second. Milestone 25c
 * (horde retune): more enemies, bounties lowered; the second pass (longer,
 * sparser waves) set the hp so that no Hard hp sits by accident 1 or 2
 * points above a multiple of a tower's base damage (12, 4, 25 and 45;
 * docs/DESIGN.md, Hard hp rule). Speeds unchanged. Milestone 28: Goblin
 * 19 -> 23 (Hard 28, three Musketeer shots on Hard and two on Easy and
 * Normal: target H2) and Troll 900 -> 950 (Hard 1140; targets T4 and T6 on
 * Switchback).
 */
export const ENEMY_STATS: Readonly<Record<EnemyType, EnemyStats>> = {
  goblin: { hp: 23, speed: 60, bounty: 2, flying: false, shield: false, livesCost: 1 },
  wolf: { hp: 20, speed: 120, bounty: 2, flying: false, shield: false, livesCost: 1 },
  troll: { hp: 950, speed: 35, bounty: 8, flying: false, shield: false, livesCost: 1 },
  harpy: { hp: 36, speed: 90, bounty: 3, flying: true, shield: false, livesCost: 1 },
  shieldbearer: { hp: 70, speed: 45, bounty: 5, flying: false, shield: true, livesCost: 1 },
  // Grumblemaw closes wave 20 and costs 6 lives if he escapes.
  grumblemaw: { hp: 5600, speed: 38, bounty: 300, flying: false, shield: false, livesCost: 6, slowCap: 0.3 },
  // Grumblefoot closes wave 10 and costs 5 lives if he escapes.
  boss: { hp: 4000, speed: 25, bounty: 150, flying: false, shield: false, livesCost: 5, slowCap: 0.3 },
};

/** The boss's type (milestone 23). */
export const BOSS_TYPE = 'boss' satisfies EnemyType;

/** Whether this enemy is the boss. */
export function isBoss(enemy: Pick<Enemy, 'type'>): boolean {
  return enemy.type === BOSS_TYPE || enemy.type === 'grumblemaw';
}

/** The slow strength this enemy actually takes from a slow of `slow`: capped by its slowCap. */
export function cappedSlow(enemy: Pick<Enemy, 'type'>, slow: number): number {
  const cap = ENEMY_STATS[enemy.type].slowCap;
  return cap === undefined ? slow : Math.min(slow, cap);
}

/**
 * The slow that acts on this enemy now (milestone 25c): the stronger of its
 * active tower slow (`slow` while `slowTicksLeft` > 0) and its active
 * special slow (`specialSlow` while `specialSlowTicksLeft` > 0), capped by
 * its slowCap (the boss: 0.3). 0 when neither is active.
 */
export function effectiveSlow(
  enemy: Pick<Enemy, 'type' | 'slow' | 'slowTicksLeft' | 'specialSlow' | 'specialSlowTicksLeft'>,
): number {
  const tower = enemy.slowTicksLeft > 0 ? enemy.slow : 0;
  const special = (enemy.specialSlowTicksLeft ?? 0) > 0 ? (enemy.specialSlow ?? 0) : 0;
  return cappedSlow(enemy, Math.max(tower, special));
}

/**
 * Whether the enemy counts as tarred (milestone 25c): a tower slow or a
 * special slow is active. Burn damage doubles while it is.
 */
export function isTarred(enemy: Pick<Enemy, 'slowTicksLeft' | 'specialSlowTicksLeft'>): boolean {
  return enemy.slowTicksLeft > 0 || (enemy.specialSlowTicksLeft ?? 0) > 0;
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
