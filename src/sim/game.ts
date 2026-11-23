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
// appends its events (events.ts). Won and lost ticks only clear
// `state.shots` (milestone 30: the last tracer no longer stays forever).
//
// Order of work inside one wave tick (move, exit, zones, burn, combat,
// spawn, counters, clear check):
//   1. Move live enemies by speed / 60 times (1 - effectiveSlow): the
//      stronger of the active tower slow and the active special slow
//      (milestone 25c), boss cap applied. Walking enemies stop on contact
//      with the first blocker and damage it. Each contacted guard strikes
//      once, even on its breaking or expiry tick. After all contacts are
//      resolved, pay guard kills as special kills and remove broken or
//      expired blockers. Held survivors resume moving next tick. Both
//      slow timers count down.
//   2. Remove enemies at or past the exit; each costs its livesCost (1, or
//      5 for the boss, milestone 23).
//      Lives <= 0 -> phase 'lost' at once, nothing else happens this tick.
//   2b. Zones (milestone 30, zonesStep), oldest first: every live enemy
//      within a zone's radius (flyers included) gets, from a Tar Barrel
//      zone, the special slow for ZONE_LINGER_TICKS (applySpecialSlow, boss
//      cap), or, from a Fire Arrows zone, the special burn for
//      ZONE_LINGER_TICKS (applyBurn: equal or stronger replaces). Then the
//      zone counts down and is removed at 0. So a zone burn does damage in
//      step 3 of the same tick, doubled if the enemy is tarred.
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
//   6. Advance waveTick and tick; count the special recharge down (at 0
//      the charge is ready, milestone 30).
//   7. If every enemy of the wave has spawned and none are alive, pay the
//      clear bonus and go to 'setup' (or 'won' after the last wave, unless
//      the game is endless, milestone 26).
//
// Towers only act during wave ticks; in 'setup' cooldowns stay where they
// are, but guard lifetimes still count down. Build, upgrade and sell (actions.ts) happen between ticks, and so
// does useSpecial (milestone 25b): its damage, slow and burn apply at once
// and its kills are removed and paid before the next tick; a Tar Barrel or
// Fire Arrows also leaves a zone (milestone 30). startWave makes the special
// charge ready; useSpecial spends it and starts SPECIAL_RECHARGE_TICKS of
// recharge, counted in wave ticks only; the wave clear in step 7 takes an
// unused charge away and removes the zones.
// callNextWave (milestone 25c) also acts between ticks: once every enemy of
// the current wave has spawned it clears that wave at once and starts the
// next one on top of the survivors. continueEndless (milestone 26) turns a
// won game into an endless one between ticks: back to 'setup' with
// everything kept, and waves go on past 20 (waves.ts waveDef).
//
// So the first enemy of a group with delay 0 spawns during the first tick()
// after startWave (waveTick 0), and an enemy spawned at waveTick k is at
// distance speed/60 * n after the tick with waveTick k + n.

import { moveEnemies } from './movement';
import { BOON_OFFER_WAVES, boonScale, boonOptions } from './boons';
import { burnEnemies, fireTowers, PACK_INTERVAL_TICKS, removeDead } from './combat';
import { ACT_TWO_HP_GROWTH, DEFAULT_DIFFICULTY, DIFFICULTY_DEFS, campaignHpFactor, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS, isBoss } from './enemies';
import type { LevelDef } from './levelTypes';
import { pathLength, resolveMap, type MapId } from './map';
import { applyBurn, applySpecialSlow, enemyPosition } from './combat';
import { SPECIAL_DEFS, ZONE_LINGER_TICKS, tarLingerTicks } from './specials';
import { secondsToTicks, TICKS_PER_SECOND } from './time';
import type { EnemyType, GameState, GroupDef, Guard, MapDef } from './types';
import { gameWaveDef, hasNextWave, lastWave, waveDef } from './waves';

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
  /** The map (milestone 27): a MAPS id, or a test's own MapDef; Meadow when left out. */
  map?: MapId | MapDef;
  /** Campaign rules take precedence over Free play map and difficulty. */
  level?: LevelDef;
}

export function createGame(options: CreateGameOptions = {}): GameState {
  const { level } = options;
  if (level && (
    level.rewardWaves.length > BOON_OFFER_WAVES.length ||
    level.rewardWaves.some((wave, index) => !Number.isInteger(wave) || wave > level.waves.length
      || wave <= (level.rewardWaves[index - 1] ?? 0))
  )) throw new RangeError(`Invalid reward waves in level ${level.id}`);
  const difficulty = level ? DEFAULT_DIFFICULTY : options.difficulty ?? DEFAULT_DIFFICULTY;
  const def = DIFFICULTY_DEFS[difficulty];
  return {
    map: resolveMap(level?.map ?? options.map),
    ...(level ? { level } : {}),
    difficulty,
    endless: false,
    boons: [],
    pendingBoon: null,
    packs: [],
    phase: 'setup',
    gold: level?.startGold ?? def.startGold,
    lives: level?.startLives ?? def.startLives,
    wave: 0,
    specialCharges: 0,
    specialRechargeTicks: 0,
    zones: [],
    blockers: [],
    nextGuardId: 0,
    nextZoneId: 0,
    cheated: false,
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
  | { ok: false; reason: 'not-in-setup' | 'boon-pending' | 'no-more-waves' };

export function startWave(state: GameState): StartWaveResult {
  if (state.phase !== 'setup') return { ok: false, reason: 'not-in-setup' };
  if (state.pendingBoon) return { ok: false, reason: 'boon-pending' };
  if (!hasNextWave(state)) return { ok: false, reason: 'no-more-waves' };
  state.wave += 1;
  state.phase = 'wave';
  state.waveTick = 0;
  state.spawnedPerGroup = gameWaveDef(state, state.wave).groups.map(() => 0);
  // The special charge is ready at every wave start (milestone 30).
  state.specialCharges = state.level?.allowedSpecials.length === 0 ? 0 : 1;
  state.specialRechargeTicks = 0;
  // Planning phase ends (milestone 25a): everything bought so far locks.
  for (const tower of state.towers) {
    tower.locked = true;
    tower.unlockedSpend = 0;
    tower.upgradedThisPhase = false;
  }
  state.events.push({ kind: 'waveStart', wave: state.wave });
  return { ok: true, wave: state.wave };
}

export type CallEarlyRefusal = 'game-over' | 'not-in-wave' | 'last-wave' | 'boon-wave' | 'still-spawning';

export type CallEarlyStatus = { ok: true; bonus: number } | { ok: false; reason: CallEarlyRefusal };

export type CallNextWaveResult = { ok: true; wave: number; bonus: number; gold: number } | { ok: false; reason: CallEarlyRefusal };

/** waveTick on which the last enemy of wave `wave` (1-based) spawns. */
export function lastSpawnTick(wave: number, state?: Pick<GameState, 'level'>): number {
  const def = state ? gameWaveDef(state, wave) : waveDef(wave);
  return Math.max(...def.groups.map((g) => spawnTick(g, g.count - 1)));
}

function rewardsForWave(state: GameState, wave: number) {
  if (state.endless) return [];
  if (!state.level) return boonOptions(wave);
  const offerWave = BOON_OFFER_WAVES[state.level.rewardWaves.indexOf(wave)];
  return offerWave === undefined ? [] : boonOptions(offerWave);
}

/**
 * Whether callNextWave would succeed now, and the early bonus it would pay
 * (milestone 25c). Refused, checked in this order: 'game-over' (won or
 * lost); 'not-in-wave' (setup); 'boon-wave' when either side of the call is a reward wave; 'last-wave' when the current wave is the
 * last, or when the next wave holds the boss (the boss is never called
 * early, so wave 19 cannot call wave 20); in an endless game (milestone 26)
 * there is no last wave and no boss, so it never applies; 'still-spawning' while an enemy
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
  if (rewardsForWave(state, state.wave).length || rewardsForWave(state, state.wave + 1).length) return { ok: false, reason: 'boon-wave' };
  if (!hasNextWave(state) || gameWaveDef(state, state.wave + 1).groups.some((g) => isBoss(g))) return { ok: false, reason: 'last-wave' };
  const groups = gameWaveDef(state, state.wave).groups;
  if (!groups.every((g, gi) => state.spawnedPerGroup[gi] >= g.count)) return { ok: false, reason: 'still-spawning' };
  const elapsedTicks = state.waveTick - (lastSpawnTick(state.wave, state) + 1);
  const remaining = Math.max(0, EARLY_CALL_GRACE_SECONDS - elapsedTicks / TICKS_PER_SECOND);
  return { ok: true, bonus: Math.min(EARLY_CALL_MAX_BONUS, Math.ceil(remaining)) };
}

/**
 * Call the next wave early (milestone 25c), between ticks like startWave.
 * Allowed when callEarlyStatus says so. The current wave counts as cleared
 * at once: it pays its WAVE_CLEAR_BONUS plus the early bonus and emits
 * `waveClear`; enemies still alive stay on the field (they exit, cost lives
 * and pay bounties as usual), and the next wave's clear check waits for
 * them too: it clears only when its own enemies have all spawned and the
 * field is empty. Then the next wave starts its spawn schedule from waveTick 0 on
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
  // Pending boss summons keep their remaining delay across the wave clock reset.
  for (const pack of state.packs) pack.nextTick -= state.waveTick;
  state.wave += 1;
  state.waveTick = 0;
  state.spawnedPerGroup = gameWaveDef(state, state.wave).groups.map(() => 0);
  state.specialCharges = state.level?.allowedSpecials.length === 0 ? 0 : 1;
  state.specialRechargeTicks = 0;
  state.events.push({ kind: 'earlyCall', wave: state.wave, bonus: status.bonus });
  state.events.push({ kind: 'waveStart', wave: state.wave });
  return { ok: true, wave: state.wave, bonus: status.bonus, gold: state.gold };
}

export type ContinueEndlessResult = { ok: true; wave: number } | { ok: false; reason: 'not-won' | 'campaign-level' };

/**
 * Keep going after the win (milestone 26), between ticks. Allowed only when
 * the phase is 'won' (wave 20 cleared); refused with 'not-won' otherwise. An
 * endless game never reaches 'won' again, so "already endless" is also
 * 'not-won'. Sets `state.endless` and goes back to 'setup' with wave 20
 * cleared: gold, lives, towers, kill counts and the special charge (0 since
 * the clear) are kept. Emits `endlessStart`. From then on Start Wave plays
 * wave 21, 22, ... (waves.ts waveDef) and the game ends only by losing. A
 * refusal changes nothing.
 */
export function continueEndless(state: GameState): ContinueEndlessResult {
  if (state.phase !== 'won') return { ok: false, reason: 'not-won' };
  if (state.level) return { ok: false, reason: 'campaign-level' };
  state.endless = true;
  state.phase = 'setup';
  state.events.push({ kind: 'endlessStart' });
  return { ok: true, wave: state.wave };
}

/**
 * The score (milestone 26): waves cleared in this run, counting from wave
 * 1, derived from the state. Every wave before the current one has cleared
 * (at its clear or when the next was called early; each wave clears once),
 * and the current one has too once the phase is 'setup' or 'won'. So a win
 * scores 20, a loss on wave 7 scores 6, and a loss on wave 24 of an endless
 * run scores 23.
 */
export function wavesCleared(state: Pick<GameState, 'phase' | 'wave'>): number {
  return state.phase === 'setup' || state.phase === 'won' ? state.wave : state.wave - 1;
}

/** Advance the game by exactly one 1/60 s step. Does nothing once won or lost. */
export function tick(state: GameState): void {
  if (state.phase === 'won' || state.phase === 'lost') {
    // Milestone 30: the win (or loss) tick's shots are drawn once, not forever.
    if (state.shots.length > 0) state.shots = [];
    return;
  }
  state.shots = [];
  state.events = [];
  if (state.phase === 'setup') {
    ageBlockers(state);
    state.tick += 1;
    return;
  }

  const guardsStruck = moveEnemies(state.enemies, state.events, state.blockers);
  if (guardsStruck) removeDead(state, 'special');
  ageBlockers(state);
  removeExitedEnemies(state);
  if (state.lives <= 0) {
    state.phase = 'lost';
    state.events.push({ kind: 'lost' });
    return;
  }
  zonesStep(state);
  burnEnemies(state);
  fireTowers(state);
  spawnDueEnemies(state);
  state.waveTick += 1;
  state.tick += 1;
  if (state.specialRechargeTicks > 0) {
    state.specialRechargeTicks -= 1;
    if (state.specialRechargeTicks === 0) state.specialCharges = 1;
  }
  checkWaveClear(state);
}

/** Remove dead blockers and give surviving guards their last full contact tick. */
function ageBlockers(state: GameState): void {
  let fallen: Guard[] | undefined;
  let expired: Guard[] | undefined;
  let remove = false;
  for (const blocker of state.blockers) {
    if (blocker.hp <= 0) {
      remove = true;
      if (blocker.kind === 'guard') (fallen ??= []).push(blocker);
    } else if (blocker.kind === 'guard' && --blocker.ticksLeft <= 0) {
      remove = true;
      (expired ??= []).push(blocker);
    }
  }
  if (remove) {
    state.blockers = state.blockers.filter((blocker) =>
      blocker.hp > 0 && (blocker.kind === 'barricade' || blocker.ticksLeft > 0));
  }
  if (expired) state.events.push({ kind: 'squadGone', guards: expired, reason: 'expired' });
  else if (fallen && !state.blockers.some((blocker) => blocker.kind === 'guard')) {
    state.events.push({ kind: 'squadGone', guards: fallen, reason: 'destroyed' });
  }
}

/**
 * Step 2b (milestone 30): each zone, oldest first, slows (Tar Barrel) or
 * burns (Fire Arrows) every live enemy inside it for ZONE_LINGER_TICKS,
 * then counts down; zones at 0 are removed.
 */
function zonesStep(state: GameState): void {
  if (state.zones.length === 0) return;
  for (const zone of state.zones) {
    applyZone(state, zone);
    zone.ticksLeft -= 1;
  }
  if (state.zones.some((z) => z.ticksLeft <= 0)) state.zones = state.zones.filter((z) => z.ticksLeft > 0);
}

/** Apply one zone's slow or burn to every live enemy inside it (also used by useSpecial when the zone lands). */
export function applyZone(state: GameState, zone: Pick<GameState['zones'][number], 'type' | 'x' | 'y' | 'radius'>): void {
  const def = SPECIAL_DEFS[zone.type];
  const slowTicks = tarLingerTicks(state.boons);
  const burnDps = boonScale(def.burnDps, state.boons, 'hotCoals');
  for (const enemy of state.enemies) {
    const p = enemyPosition(enemy, state.map);
    if (Math.hypot(p.x - zone.x, p.y - zone.y) > zone.radius) continue;
    if (def.slow > 0) applySpecialSlow(enemy, def.slow, slowTicks);
    if (def.burnDps > 0) applyBurn(enemy, burnDps, ZONE_LINGER_TICKS, 'special');
  }
}

function removeExitedEnemies(state: GameState): void {
  const exit = pathLength(state.map);
  let kept = 0;
  for (const e of state.enemies) {
    if (e.distance < exit) {
      state.enemies[kept++] = e;
      continue;
    }
    state.lives -= ENEMY_STATS[e.type].livesCost;
    state.events.push({ kind: 'exit', enemyId: e.id });
    if (isBoss(e)) state.events.push({ kind: 'bossDown', enemyId: e.id, enemyType: e.type, cause: 'exit' });
  }
  state.enemies.length = kept;
}

function spawnDueEnemies(state: GameState): void {
  const def = gameWaveDef(state, state.wave);
  def.groups.forEach((group, gi) => {
    for (let index = state.spawnedPerGroup[gi]; index < group.count && spawnTick(group, index) === state.waveTick; index++) {
      spawnEnemy(state, group.type, def.hpMultiplier);
      state.spawnedPerGroup[gi] = index + 1;
    }
  });
  for (const pack of state.packs) {
    if (pack.nextTick !== state.waveTick) continue;
    spawnEnemy(state, 'wolf', def.hpMultiplier);
    pack.remaining -= 1;
    pack.nextTick += PACK_INTERVAL_TICKS;
  }
  if (state.packs.length) state.packs = state.packs.filter((p) => p.remaining > 0);
}

function spawnEnemy(state: GameState, type: EnemyType, multiplier?: number): void {
  const level = state.level;
  const growth = level?.hpGrowthStart == null ? 0 : Math.max(0, state.wave - level.hpGrowthStart + 1);
  const scale = level
    ? level.hpScale * (1 + ACT_TWO_HP_GROWTH.normal * growth)
    : campaignHpFactor(state.wave, state.difficulty);
  const factor = scale * (multiplier ?? 1);
  const hp = enemyMaxHp(type, state.difficulty, factor);
  const id = state.nextEnemyId++;
  const enemy = {
    id, type, hp, distance: 0, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0,
    burnDps: 0, burnTicksLeft: 0,
    ...(factor === 1 ? {} : { maxHp: hp }),
  };
  state.enemies.push(enemy);
  state.events.push({ kind: 'spawn', enemyId: id, enemyType: type });
  if (isBoss(enemy)) state.events.push({ kind: 'bossSpawn', enemyId: id, enemyType: type });
}

function checkWaveClear(state: GameState): void {
  if (state.enemies.length || state.packs.length) return;
  const groups = gameWaveDef(state, state.wave).groups;
  const allSpawned = groups.every((grp, gi) => state.spawnedPerGroup[gi] >= grp.count);
  if (!allSpawned) return;
  state.gold += WAVE_CLEAR_BONUS;
  // An unused special charge does not carry over (milestone 25b), and the
  // zones end with the wave (milestone 30).
  state.specialCharges = 0;
  state.specialRechargeTicks = 0;
  state.zones = [];
  state.events.push({ kind: 'waveClear', wave: state.wave, bonus: WAVE_CLEAR_BONUS });
  // An endless game (milestone 26) never wins again: it ends only by losing.
  state.phase = !state.endless && state.wave >= lastWave(state) && state.lives > 0 ? 'won' : 'setup';
  if (state.phase === 'won') state.events.push({ kind: 'won' });
  const options = rewardsForWave(state, state.wave);
  if (options.length) {
    state.pendingBoon = { wave: state.wave, options };
    state.events.push({ kind: 'boonOffered', wave: state.wave, options: [...options] });
  }
}
