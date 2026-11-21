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
//   1. Move live enemies by speed / 60 (times (1 - slow) while a slow is
//      active), then count down slow timers.
//   2. Remove enemies at or past the exit; each costs its livesCost (1, or
//      5 for the boss, milestone 23).
//      Lives <= 0 -> phase 'lost' at once, nothing else happens this tick.
//   3. Burn (combat.ts burnEnemies): each burning enemy takes burnDps / 60,
//      doubled if slowTicksLeft > 0 after step 1, then its burn timer counts
//      down. Dead enemies (hp <= KILL_EPSILON, 1e-9) are removed and pay
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
//      distance 0. A new enemy does not move or get shot on its spawn tick.
//   6. Advance waveTick and tick.
//   7. If every enemy of the wave has spawned and none are alive, pay the
//      clear bonus and go to 'setup' (or 'won' after the last wave).
//
// Towers only act during wave ticks; in 'setup' cooldowns stay where they
// are. Build, upgrade and sell (actions.ts) happen between ticks.
//
// So the first enemy of a group with delay 0 spawns during the first tick()
// after startWave (waveTick 0), and an enemy spawned at waveTick k is at
// distance speed/60 * n after the tick with waveTick k + n.

import { burnEnemies, fireTowers } from './combat';
import { ENEMY_STATS, isBoss } from './enemies';
import { MAP, pathLength } from './map';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import type { GameState, GroupDef } from './types';
import { WAVES } from './waves';

export { secondsToTicks, TICKS_PER_SECOND };
export const START_GOLD = 100;
export const START_LIVES = 20;
export const WAVE_CLEAR_BONUS = 25;

export function createGame(): GameState {
  return {
    phase: 'setup',
    gold: START_GOLD,
    lives: START_LIVES,
    wave: 0,
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
  state.events.push({ kind: 'waveStart', wave: state.wave });
  return { ok: true, wave: state.wave };
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
    const slow = enemy.slowTicksLeft > 0 ? enemy.slow : 0;
    enemy.distance += (ENEMY_STATS[enemy.type].speed * (1 - slow)) / TICKS_PER_SECOND;
    if (enemy.slowTicksLeft > 0) {
      enemy.slowTicksLeft -= 1;
      if (enemy.slowTicksLeft === 0) enemy.slow = 0;
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
        hp: ENEMY_STATS[group.type].hp,
        distance: 0,
        slow: 0,
        slowTicksLeft: 0,
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
  state.events.push({ kind: 'waveClear', wave: state.wave, bonus: WAVE_CLEAR_BONUS });
  state.phase = state.wave >= WAVES.length && state.lives > 0 ? 'won' : 'setup';
  if (state.phase === 'won') state.events.push({ kind: 'won' });
}
