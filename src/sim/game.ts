// Game state and the fixed-step tick.
//
// State model: MUTATING. `createGame` returns a fresh GameState; `startWave`
// and `tick` change the state they are given in place. `startWave` returns a
// typed result; `tick` returns nothing. Callers that need a snapshot copy the
// state (it is plain data, so `structuredClone` works).
//
// Determinism: no Math.random, no Date. One tick is exactly 1/60 s.
//
// Every tick that runs (setup or wave) first clears `state.shots` and
// `state.events`; combat appends one shot per tower that fires, and each step
// appends its events (events.ts). Won and lost ticks change nothing.
//
// Order of work inside one wave tick (move, exit, burn, combat, spawn,
// counters, clear check):
//   1. Move live enemies by speed / 60 times (1 - effectiveSlow): the
//      stronger of the active tower slow and the active special slow
//      (milestone 25c), boss cap applied; then count down both slow timers.
//   2. Remove enemies at or past the exit; each costs its livesCost (1, or
//      5 for the boss, milestone 23).
//      Lives <= 0 -> phase 'lost' at once, nothing else happens this tick.
//   3. Burn (combat.ts burnEnemies): each burning enemy takes burnDps / 60,
//      doubled if it is tarred (a tower or special slow active, milestone
//      25c) after step 1, then its burn timer counts down. Dead enemies (hp <= KILL_EPSILON, 1e-9) are removed and pay
//      their bounty. A burn applied in step 4 first does damage on the next
//      tick.
//   4. Towers fire (combat.ts fireTowers), in cellKey order. Each tower
//      counts its cooldown down by 1 if above 0; at 0 with a target in range
//      (and not inside a Mortar's minimum range) it fires and its cooldown
//      becomes round(60 / fireRate). Dead enemies are removed and pay
//      their bounty before the next tower acts, so a later tower never
//      targets an enemy killed this tick. A new slow first affects movement
//      on the next tick.
//   5. Spawn enemies whose spawn tick equals the current waveTick, at
//      distance 0, with the level's hp (difficulty.ts enemyMaxHp). A new enemy does not move or get shot on its spawn tick.
//   6. Advance waveTick and tick.
//   7. If every enemy of the wave has spawned and none are alive, pay the
//      clear bonus and go to 'setup' (or 'won' after the last wave).
//
// Towers only act during wave ticks; in 'setup' cooldowns stay where they
// are. Build, upgrade and sell (actions.ts) happen between ticks, and so
// does useSpecial (milestone 25b): its damage, slow and burn apply at once
// and its kills are removed and paid before the next tick. startWave grants
// one special charge; the wave clear in step 7 takes an unused one away.
// callNextWave (milestone 25c) also acts between ticks: once every enemy of
// the current wave has spawned it clears that wave at once and starts the
// next one on top of the survivors.
//
// So the first enemy of a group with delay 0 spawns during the first tick()
// after startWave (waveTick 0), and an enemy spawned at waveTick k is at
// distance speed/60 * n after the tick with waveTick k + n.

import { burnEnemies, fireTowers } from './combat';
import { DEFAULT_DIFFICULTY, DIFFICULTY_DEFS, enemyMaxHp, type Difficulty } from './difficulty';
import { effectiveSlow, ENEMY_STATS, isBoss } from './enemies';
import { MAP, pathLength } from './map';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import type { GameState, GroupDef } from './types';
import { WAVES } from './waves';

export { secondsToTicks, TICKS_PER_SECOND };
/** Normal's starting gold and lives (difficulty.ts has every level's). */
export const START_GOLD = DIFFICULTY_DEFS.normal.startGold;
export const START_LIVES = DIFFICULTY_DEFS.normal.startLives;
export const WAVE_CLEAR_BONUS = 25;
/** Call early (milestone 25c): the grace window after a wave's last spawn, in seconds. */
export const EARLY_CALL_GRACE_SECONDS = 20;
/** Call early: the most the early bonus pays. */
export const EARLY_CALL_MAX_BONUS = 20;

export interface CreateGameOptions {
  /** Difficulty level (milestone 25); Normal when left out. */
  difficulty?: Difficulty;
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const difficulty = options.difficulty ?? DEFAULT_DIFFICULTY;
  const def = DIFFICULTY_DEFS[difficulty];
  return {
    difficulty,
    phase: 'setup',
    gold: def.startGold,
    lives: def.startLives,
    wave: 0,
    specialCharges: 0,
    tick: 0,
    waveTick: 0,
    spawnedPerGroup: [],
    enemies: [],
    nextEnemyId: 0,
    towers: [],
    shots: [],
    events: [],
  };
}

/** waveTick on which enemy `index` (0-based) of `group` spawns. */
export function spawnTick(group: GroupDef, index: number): number {
  return secondsToTicks(group.delay + index * group.interval);
}

export type StartWaveResult =
  | { ok: true; wave: number }
  | { ok: false; reason: 'not-in-setup' | 'no-more-waves' };

export function startWave(state: GameState): StartWaveResult {
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  if (state.wave >= WAVES.length) return { ok: false, reason: 'no-more-waves' };
  state.wave += 1;
  state.phase = 'wave';
  state.waveTick = 0;
  state.spawnedPerGroup = WAVES[state.wave - 1].groups.map(() => 0);
  // One special charge per wave (milestone 25b); never more than one.
  state.specialCharges = 1;
  // Planning phase ends (milestone 25a): everything bought so far locks.
  for (const tower of state.towers) {
    tower.locked = true;
    tower.unlockedSpend = 0;
    tower.upgradedThisPhase = false;
  }
  state.events.push({ kind: 'waveStart', wave: state.wave });
  return { ok: true, wave: state.wave };
}

export type CallEarlyRefusal = 'game-over' | 'not-in-wave' | 'last-wave' | 'still-spawning';

export type CallEarlyStatus = { ok: true; bonus: number } | { ok: false; reason: CallEarlyRefusal };

export type CallNextWaveResult = { ok: true; wave: number; bonus: number; gold: number } | { ok: false; reason: CallEarlyRefusal };

/** waveTick on which the last enemy of wave `wave` (1-based) spawns. */
export function lastSpawnTick(wave: number): number {
  return Math.max(...WAVES[wave - 1].groups.map((g) => spawnTick(g, g.count - 1)));
}

/**
 * Whether callNextWave would succeed now, and the early bonus it would pay
 * (milestone 25c). Refused, checked in this order: 'game-over' (won or
 * lost); 'not-in-wave' (setup); 'last-wave' when the current wave is the
 * last, or when the next wave holds the boss (the boss is never called
 * early, so wave 9 cannot call wave 10); 'still-spawning' while an enemy
 * of the current wave has yet to spawn. The bonus is
 * min(EARLY_CALL_MAX_BONUS, ceil(secondsRemaining)), where secondsRemaining
 * = max(0, EARLY_CALL_GRACE_SECONDS - seconds since the last spawn). The
 * last spawn happens during the tick with waveTick = lastSpawnTick; between
 * ticks right after it, 0 s have passed (bonus 20); each later tick adds
 * 1/60 s, so the bonus is 19 after 60 more ticks and 0 from 1200 on.
 */
export function callEarlyStatus(state: GameState): CallEarlyStatus {
  if (state.phase === 'won' || state.phase === 'lost') return { ok: false, reason: 'game-over' };
  if (state.phase !== 'wave') return { ok: false, reason: 'not-in-wave' };
  const next = WAVES[state.wave];
  if (!next || next.groups.some((g) => isBoss(g))) return { ok: false, reason: 'last-wave' };
  const groups = WAVES[state.wave - 1].groups;
  if (!groups.every((g, gi) => state.spawnedPerGroup[gi] >= g.count)) return { ok: false, reason: 'still-spawning' };
  const elapsedTicks = state.waveTick - (lastSpawnTick(state.wave) + 1);
  const remaining = Math.max(0, EARLY_CALL_GRACE_SECONDS - elapsedTicks / TICKS_PER_SECOND);
  return { ok: true, bonus: Math.min(EARLY_CALL_MAX_BONUS, Math.ceil(remaining)) };
}

/**
 * Call the next wave early (milestone 25c), between ticks like startWave.
 * Allowed when callEarlyStatus says so. The current wave counts as cleared
 * at once: it pays its WAVE_CLEAR_BONUS plus the early bonus and emits
 * `waveClear`; enemies still alive stay on the field (they exit, cost lives
 * and pay bounties as usual) but no longer belong to any wave's clear
 * check. Then the next wave starts its spawn schedule from waveTick 0 on
 * top of them: the wave counter goes up, the special charge is set to 1
 * (an unused one does not carry over), and `earlyCall {wave, bonus}` (the
 * new wave) and `waveStart` follow. Towers are already locked mid-wave.
 */
export function callNextWave(state: GameState): CallNextWaveResult {
  const status = callEarlyStatus(state);
  if (!status.ok) return status;
  const cleared = state.wave;
  state.gold += WAVE_CLEAR_BONUS + status.bonus;
  state.events.push({ kind: 'waveClear', wave: cleared, bonus: WAVE_CLEAR_BONUS });
  state.wave += 1;
  state.waveTick = 0;
  state.spawnedPerGroup = WAVES[state.wave - 1].groups.map(() => 0);
  state.specialCharges = 1;
  state.events.push({ kind: 'earlyCall', wave: state.wave, bonus: status.bonus });
  state.events.push({ kind: 'waveStart', wave: state.wave });
  return { ok: true, wave: state.wave, bonus: status.bonus, gold: state.gold };
}

/** Advance the game by exactly one 1/60 s step. Does nothing once won or lost. */
export function tick(state: GameState): void {
  if (state.phase === 'won' || state.phase === 'lost') return;
  state.shots = [];
  state.events = [];
  if (state.phase === 'setup') {
    state.tick += 1;
    return;
  }

  moveEnemies(state);
  removeExitedEnemies(state);
  if (state.lives <= 0) {
    state.phase = 'lost';
    state.events.push({ kind: 'lost' });
    return;
  }
  burnEnemies(state);
  fireTowers(state);
  spawnDueEnemies(state);
  state.waveTick += 1;
  state.tick += 1;
  checkWaveClear(state);
}

function moveEnemies(state: GameState): void {
  for (const enemy of state.enemies) {
    const slow = effectiveSlow(enemy);
    enemy.distance += (ENEMY_STATS[enemy.type].speed * (1 - slow)) / TICKS_PER_SECOND;
    if (enemy.slowTicksLeft > 0) {
      enemy.slowTicksLeft -= 1;
      if (enemy.slowTicksLeft === 0) enemy.slow = 0;
    }
    const special = enemy.specialSlowTicksLeft ?? 0;
    if (special > 0) {
      enemy.specialSlowTicksLeft = special - 1;
      if (special === 1) enemy.specialSlow = 0;
    }
  }
}

function removeExitedEnemies(state: GameState): void {
  const exit = pathLength(MAP);
  const remaining: GameState['enemies'] = [];
  for (const e of state.enemies) {
    if (e.distance < exit) {
      remaining.push(e);
      continue;
    }
    state.lives -= ENEMY_STATS[e.type].livesCost;
    state.events.push({ kind: 'exit', enemyId: e.id });
    if (isBoss(e)) state.events.push({ kind: 'bossDown', enemyId: e.id, cause: 'exit' });
  }
  state.enemies = remaining;
}

function spawnDueEnemies(state: GameState): void {
  const groups = WAVES[state.wave - 1].groups;
  groups.forEach((group, gi) => {
    const index = state.spawnedPerGroup[gi];
    if (index < group.count && spawnTick(group, index) === state.waveTick) {
      state.enemies.push({
        id: state.nextEnemyId,
        type: group.type,
        hp: enemyMaxHp(group.type, state.difficulty),
        distance: 0,
        slow: 0,
        slowTicksLeft: 0,
        specialSlow: 0,
        specialSlowTicksLeft: 0,
        burnDps: 0,
        burnTicksLeft: 0,
      });
      state.events.push({ kind: 'spawn', enemyId: state.nextEnemyId, enemyType: group.type });
      if (isBoss(group)) state.events.push({ kind: 'bossSpawn', enemyId: state.nextEnemyId });
      state.nextEnemyId += 1;
      state.spawnedPerGroup[gi] = index + 1;
    }
  });
}

function checkWaveClear(state: GameState): void {
  const groups = WAVES[state.wave - 1].groups;
  const allSpawned = groups.every((grp, gi) => state.spawnedPerGroup[gi] >= grp.count);
  if (!allSpawned || state.enemies.length > 0) return;
  state.gold += WAVE_CLEAR_BONUS;
  // An unused special charge does not carry over (milestone 25b).
  state.specialCharges = 0;
  state.events.push({ kind: 'waveClear', wave: state.wave, bonus: WAVE_CLEAR_BONUS });
  state.phase = state.wave >= WAVES.length && state.lives > 0 ? 'won' : 'setup';
  if (state.phase === 'won') state.events.push({ kind: 'won' });
}
