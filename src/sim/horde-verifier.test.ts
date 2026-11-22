// Verifier probes for milestone 25c (horde retune, call early, kill counts,
// special slow channel). Written by the verifier, independent of the
// implementer's callEarly / killCounts / specialSlow tests: conservation of
// enemies and gold over full games, the early-call edge cases, the two slow
// slots through real towers and specials, and byte-equal determinism.
import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, towerAt, upgradeTower, useSpecial } from './actions';
import { applySlow, enemyPosition } from './combat';
import { DIFFICULTIES, DIFFICULTY_DEFS } from './difficulty';
import { effectiveSlow, ENEMY_STATS, isTarred } from './enemies';
import type { GameEvent } from './events';
import { callEarlyStatus, callNextWave, createGame, lastSpawnTick, startWave, tick, WAVE_CLEAR_BONUS } from './game';
import { cellKey, type Cell } from './grid';
import { applyAction, ARCHETYPES, COMBO_PLAN, comboBuild, playScripted, type WaveScript } from './headless';
import { MAPS, pathLength, positionAlongPath } from './map';
import { SPECIAL_DEFS } from './specials';
import { TOWER_DEFS } from './towers';
import type { Enemy, EnemyType, GameState } from './types';
import { WAVES } from './waves';

/** A function, so TypeScript does not narrow the phase across the ticks that change it. */
const running = (s: GameState): boolean => s.phase === 'wave';

/** Everything that happened in a game, gathered from events by an observer outside the sim. */
interface Ledger {
  spawned: number[];
  exited: number[];
  /** Kill events in order, with the cell the verifier credits (undefined: nobody). */
  kills: { id: number; cause: string; credit?: number }[];
  bounties: number;
  clearBonuses: number;
  earlyBonuses: number;
  refunds: number;
  spend: number;
  waveClears: number[];
  waveStarts: number[];
  earlyCalls: number[];
  won: number;
  lost: number;
}

function newLedger(): Ledger {
  return {
    spawned: [], exited: [], kills: [], bounties: 0, clearBonuses: 0, earlyBonuses: 0, refunds: 0, spend: 0,
    waveClears: [], waveStarts: [], earlyCalls: [], won: 0, lost: 0,
  };
}

/**
 * Book a batch of events. `burnOwners` maps enemy id to the cellKey of its
 * burn's owner as it was before the batch (burns tick before towers fire, so
 * the owner at the start of the tick is the one whose burn kills). A shot
 * kill is credited to the cell of the last `hit` on that enemy in the batch.
 */
function book(ledger: Ledger, events: readonly GameEvent[], burnOwners: ReadonlyMap<number, number>, towerCost: (e: GameEvent) => number): void {
  const lastHit = new Map<number, number>();
  for (const e of events) {
    switch (e.kind) {
      case 'spawn': ledger.spawned.push(e.enemyId); break;
      case 'exit': ledger.exited.push(e.enemyId); break;
      case 'hit': lastHit.set(e.enemyId, cellKey(e.cell)); break;
      case 'kill': {
        const credit = e.cause === 'shot' ? lastHit.get(e.enemyId) : e.cause === 'burn' ? burnOwners.get(e.enemyId) : undefined;
        ledger.kills.push({ id: e.enemyId, cause: e.cause, credit });
        ledger.bounties += e.bounty;
        break;
      }
      case 'waveClear': ledger.waveClears.push(e.wave); ledger.clearBonuses += e.bonus; break;
      case 'earlyCall': ledger.earlyCalls.push(e.wave); ledger.earlyBonuses += e.bonus; break;
      case 'waveStart': ledger.waveStarts.push(e.wave); break;
      case 'sell': ledger.refunds += e.refund; break;
      case 'undoUpgrade': ledger.refunds += e.refund; break;
      case 'build': case 'upgrade': ledger.spend += towerCost(e); break;
      case 'won': ledger.won += 1; break;
      case 'lost': ledger.lost += 1; break;
      default: break;
    }
  }
}

function cost(e: GameEvent): number {
  if (e.kind === 'build') return TOWER_DEFS[e.tower].cost;
  if (e.kind === 'upgrade') return TOWER_DEFS[e.tower].upgradeCost;
  return 0;
}

function owners(s: GameState): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of s.enemies) if (e.burnOwner && (e.burnTicksLeft ?? 0) > 0) m.set(e.id, cellKey(e.burnOwner));
  return m;
}

/** Run `act` (an action between ticks) and book only the events it added. */
function between(s: GameState, ledger: Ledger, act: () => void): void {
  const before = s.events.length;
  const own = owners(s);
  act();
  book(ledger, s.events.slice(before), own, cost);
}

function step(s: GameState, ledger: Ledger): void {
  const own = owners(s);
  tick(s);
  book(ledger, s.events, own, cost);
}

/** The conservation checks that must hold whenever no enemy is alive. */
function expectEnemiesConserved(s: GameState, ledger: Ledger, label: string, soldKills = 0): void {
  const gone = [...ledger.kills.map((k) => k.id), ...ledger.exited];
  expect(new Set(gone).size, `${label}: an enemy was counted twice`).toBe(gone.length);
  expect(gone.length + s.enemies.length, `${label}: kills + exits + alive = spawned`).toBe(ledger.spawned.length);
  expect(ledger.spawned.length).toBe(s.nextEnemyId);
  const uncredited = ledger.kills.filter((k) => k.credit === undefined).length;
  const towerKills = soldKills + s.towers.reduce((n, t) => n + t.kills, 0);
  expect(towerKills + uncredited + ledger.exited.length + s.enemies.length, `${label}: tower kills + uncredited kills + exits`).toBe(ledger.spawned.length);
}

/** Tick-by-tick replay of a WaveScript, booking everything. `onClear` runs at each wave end. */
function replay(script: WaveScript, onClear: (s: GameState, ledger: Ledger, wave: number) => void): { s: GameState; ledger: Ledger } {
  const s = createGame();
  const ledger = newLedger();
  for (let i = 0; i < WAVES.length && s.phase === 'setup'; i++) {
    for (const a of script[i] ?? []) between(s, ledger, () => expect(applyAction(s, a)).toMatchObject({ result: { ok: true } }));
    between(s, ledger, () => startWave(s));
    while (running(s)) {
      for (const a of script.timed?.[i] ?? []) if (a.atWaveTick === s.waveTick) between(s, ledger, () => applyAction(s, a));
      step(s, ledger);
    }
    onClear(s, ledger, i + 1);
  }
  return { s, ledger };
}

describe('E1. enemy conservation and kill credit over a full comboBuild game (Normal)', () => {
  it('at every wave clear: tower kills + uncredited kills + exits = spawned, no enemy twice; each tower has exactly the kills the events give it', () => {
    let clears = 0;
    const { s, ledger } = replay(comboBuild(), (state, led, wave) => {
      clears += 1;
      expect(state.enemies).toEqual([]);
      expectEnemiesConserved(state, led, `wave ${wave}`);
      // Per tower: the verifier's own count from hit / kill events and burn owners.
      const want = new Map<number, number>();
      for (const k of led.kills) if (k.credit !== undefined) want.set(k.credit, (want.get(k.credit) ?? 0) + 1);
      for (const t of state.towers) expect(t.kills, `wave ${wave}, tower ${t.type} (${t.cell.col},${t.cell.row})`).toBe(want.get(cellKey(t.cell)) ?? 0);
      const spawnedSoFar = WAVES.slice(0, wave).reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0);
      expect(led.spawned.length).toBe(spawnedSoFar);
    });
    expect(clears).toBe(10);
    expect(s.phase).toBe('won');
    expect(ledger.spawned.length).toBe(524);
    expect(ledger.exited.length).toBe(DIFFICULTY_DEFS.normal.startLives - s.lives);
    // The three kinds of kill all occur, so the check above is not vacuous.
    expect(ledger.kills.some((k) => k.cause === 'shot')).toBe(true);
    expect(ledger.kills.some((k) => k.cause === 'burn' && k.credit !== undefined)).toBe(true);
    expect(ledger.kills.some((k) => k.cause === 'special')).toBe(true);
  });

  it('gold: start + bounties + clear bonuses + early bonuses + refunds - spend = final gold', () => {
    const { s, ledger } = replay(comboBuild(), () => {});
    expect(ledger.earlyBonuses).toBe(0);
    expect(ledger.clearBonuses).toBe(10 * WAVE_CLEAR_BONUS);
    expect(DIFFICULTY_DEFS.normal.startGold + ledger.bounties + ledger.clearBonuses + ledger.earlyBonuses + ledger.refunds - ledger.spend).toBe(s.gold);
    expect(s.gold).toBe(484);
  });
});

/**
 * A full game that calls the next wave the first moment it is allowed,
 * follows COMBO_PLAN whenever gold allows (in setup and mid-wave), and sells
 * and rebuilds one Fire Pot mid-wave. Lives are raised so it runs all ten
 * waves whatever leaks.
 */
function playCallingEarly(lives: number): { s: GameState; ledger: Ledger; soldKills: number } {
  const s = createGame();
  s.lives = lives;
  const ledger = newLedger();
  let next = 0;
  let sold = false;
  let soldKills = 0;
  const buy = () => {
    for (let a = COMBO_PLAN[next]; a; a = COMBO_PLAN[next]) {
      const price = a.type === 'build' ? TOWER_DEFS[a.tower].cost : a.type === 'upgrade' ? TOWER_DEFS[towerAt(s, a.cell)!.type].upgradeCost : 0;
      if (s.gold < price) break;
      between(s, ledger, () => expect(applyAction(s, a)).toMatchObject({ result: { ok: true } }));
      next += 1;
    }
  };
  let guard = 0;
  while (s.phase !== 'won' && s.phase !== 'lost' && guard++ < 10 * 60 * 600) {
    buy();
    if (s.phase === 'setup') between(s, ledger, () => expect(startWave(s).ok).toBe(true));
    else if (callEarlyStatus(s).ok) between(s, ledger, () => expect(callNextWave(s).ok).toBe(true));
    // One sell and rebuild mid-wave, with enemies burning from that Fire Pot.
    const pot: Cell = { col: 14, row: 9 };
    if (!sold && s.phase === 'wave' && s.enemies.some((e) => e.burnOwner && cellKey(e.burnOwner) === cellKey(pot) && (e.burnTicksLeft ?? 0) > 0) && s.gold >= TOWER_DEFS.firepot.cost) {
      sold = true;
      // The sold tower takes its count with it; the verifier keeps it for the sum.
      soldKills = towerAt(s, pot)!.kills;
      between(s, ledger, () => expect(sellTower(s, pot).ok).toBe(true));
      expect(s.enemies.some((e) => e.burnOwner && cellKey(e.burnOwner) === cellKey(pot))).toBe(false);
      between(s, ledger, () => expect(buildTower(s, pot, 'firepot').ok).toBe(true));
    }
    step(s, ledger);
  }
  return { s, ledger, soldKills };
}

describe('E2. a game that calls early every time it can', () => {
  const { s, ledger, soldKills } = playCallingEarly(1e6);

  it('ends won after wave 10; waveClear fires exactly once per wave, in order; won fires once', () => {
    expect(s.phase).toBe('won');
    expect(s.wave).toBe(10);
    expect(ledger.waveClears).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ledger.waveStarts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ledger.won).toBe(1);
    expect(ledger.lost).toBe(0);
  });

  it('calls waves 2 to 9 early, never wave 10 (the boss wave), each with the full 20', () => {
    expect(ledger.earlyCalls).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
    expect(ledger.earlyBonuses).toBe(8 * 20);
    expect(ledger.clearBonuses).toBe(10 * WAVE_CLEAR_BONUS);
  });

  it('every one of the 524 enemies was killed or exited exactly once; exits cost exactly their lives', () => {
    expect(s.enemies).toEqual([]);
    expect(ledger.spawned.length).toBe(524);
    expect(soldKills).toBeGreaterThan(0);
    expectEnemiesConserved(s, ledger, 'end', soldKills);
    // No boss exit is possible with lives this high and still be 'won', but count by type anyway.
    expect(1e6 - s.lives).toBeGreaterThanOrEqual(ledger.exited.length);
  });

  it('gold is conserved through early bonuses, a mid-wave sell (70%) and a rebuild', () => {
    expect(ledger.refunds).toBeGreaterThan(0);
    expect(DIFFICULTY_DEFS.normal.startGold + ledger.bounties + ledger.clearBonuses + ledger.earlyBonuses + ledger.refunds - ledger.spend).toBe(s.gold);
  });

  it('plays identically twice (byte-equal final state)', () => {
    expect(JSON.stringify(playCallingEarly(1e6).s)).toBe(JSON.stringify(s));
  });
});

/** A Normal game in wave `wave` with no towers, run until just after its last spawn. */
function justSpawned(wave: number, lives = 1e6): GameState {
  const s = createGame();
  s.lives = lives;
  s.wave = wave - 1;
  expect(startWave(s).ok).toBe(true);
  while (s.waveTick <= lastSpawnTick(wave)) tick(s);
  return s;
}

describe('E3. call early: the bonus', () => {
  it('one tick before the last spawn it is refused; right after it 20; +59 ticks 20; +60 19; +1199 1; +1200 0 (wave 5, Trolls keep the wave alive)', () => {
    const s = createGame();
    s.lives = 1e6;
    s.wave = 4;
    startWave(s);
    const last = lastSpawnTick(5);
    expect(last).toBe(2340);
    while (s.waveTick < last) tick(s);
    // waveTick === last: the tick that spawns the last enemy has not run yet.
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'still-spawning' });
    tick(s);
    const at = (extra: number) => {
      while (s.waveTick < last + 1 + extra) tick(s);
      expect(s.phase, `still in the wave at +${extra}`).toBe('wave');
      return callEarlyStatus(s);
    };
    expect(at(0)).toEqual({ ok: true, bonus: 20 });
    expect(at(1)).toEqual({ ok: true, bonus: 20 });
    expect(at(59)).toEqual({ ok: true, bonus: 20 });
    expect(at(60)).toEqual({ ok: true, bonus: 19 });
    expect(at(61)).toEqual({ ok: true, bonus: 19 });
    expect(at(1139)).toEqual({ ok: true, bonus: 2 });
    expect(at(1140)).toEqual({ ok: true, bonus: 1 });
    expect(at(1199)).toEqual({ ok: true, bonus: 1 });
    expect(at(1200)).toEqual({ ok: true, bonus: 0 });
    expect(at(1500)).toEqual({ ok: true, bonus: 0 });
    const gold = s.gold;
    expect(callNextWave(s)).toEqual({ ok: true, wave: 6, bonus: 0, gold: gold + WAVE_CLEAR_BONUS });
  });

  it('for every whole second k from 0 to 20 the bonus is 20 - k exactly on the second and 20 - k on the 59 ticks before the next (no float drift)', () => {
    for (let k = 0; k <= 19; k++) {
      for (const off of [0, 1, 30, 59]) {
        const s = createGame();
        s.phase = 'wave';
        s.wave = 5;
        s.spawnedPerGroup = WAVES[4].groups.map((g) => g.count);
        s.waveTick = lastSpawnTick(5) + 1 + 60 * k + off;
        expect(callEarlyStatus(s), `k ${k} off ${off}`).toEqual({ ok: true, bonus: 20 - k });
      }
    }
  });

  it('callEarlyStatus never changes the state', () => {
    const s = justSpawned(3);
    const copy = structuredClone(s);
    callEarlyStatus(s);
    expect(s).toEqual(copy);
  });
});

describe('E4. call early: refusals change nothing (deep compare)', () => {
  const refused = (s: GameState, reason: string) => {
    const copy = structuredClone(s);
    expect(callNextWave(s)).toEqual({ ok: false, reason });
    expect(s).toEqual(copy);
  };

  it('game-over (lost and won), also when everything else would allow the call', () => {
    for (const phase of ['lost', 'won'] as const) {
      const s = justSpawned(3);
      s.phase = phase;
      refused(s, 'game-over');
    }
  });

  it('not-in-wave in setup, before wave 1 and between waves', () => {
    refused(createGame(), 'not-in-wave');
    const s = createGame();
    s.lives = 1e6;
    startWave(s);
    while (running(s)) tick(s);
    expect(s.phase).toBe('setup');
    refused(s, 'not-in-wave');
  });

  it('last-wave on wave 10, and on wave 9 calling wave 10 (the boss), even after every enemy has spawned; last-wave wins over still-spawning', () => {
    refused(justSpawned(10), 'last-wave');
    refused(justSpawned(9), 'last-wave');
    for (const wave of [9, 10]) {
      const s = createGame();
      s.wave = wave - 1;
      startWave(s);
      tick(s);
      refused(s, 'last-wave');
    }
  });

  it('wave 8 can call wave 9: the last call the game allows', () => {
    const s = justSpawned(8);
    expect(callNextWave(s)).toMatchObject({ ok: true, wave: 9, bonus: 20 });
    while (s.waveTick <= lastSpawnTick(9)) tick(s);
    refused(s, 'last-wave');
  });

  it('still-spawning on every tick of wave 2 up to its last spawn', () => {
    const s = createGame();
    s.lives = 1e6;
    s.wave = 1;
    startWave(s);
    for (let i = 0; i <= lastSpawnTick(2); i++) {
      refused(s, 'still-spawning');
      tick(s);
    }
    expect(callEarlyStatus(s)).toEqual({ ok: true, bonus: 20 });
  });
});

describe('E5. call early: the old wave on the field', () => {
  it('two calls in a row: the second is refused still-spawning and changes nothing', () => {
    const s = justSpawned(1);
    expect(callNextWave(s)).toMatchObject({ ok: true, wave: 2, bonus: 20 });
    const copy = structuredClone(s);
    expect(callNextWave(s)).toEqual({ ok: false, reason: 'still-spawning' });
    expect(s).toEqual(copy);
  });

  it('with no towers: survivors of wave 1 still exit and cost lives; wave 2 clears once, only when the field is empty', () => {
    const s = justSpawned(1, 1000);
    const alive = s.enemies.length;
    const exitedAlready = 1000 - s.lives;
    expect(alive + exitedAlready).toBe(20);
    expect(alive).toBeGreaterThan(0);
    const goldBefore = s.gold;
    const ledger = newLedger();
    between(s, ledger, () => callNextWave(s));
    expect(s.gold).toBe(goldBefore + 25 + 20);
    expect(s.enemies.length).toBe(alive);
    expect(s.phase).toBe('wave');
    let emptyTicksInWave = 0;
    while (running(s)) {
      step(s, ledger);
      if (s.phase === 'wave' && s.enemies.length === 0) emptyTicksInWave += 1;
    }
    expect(ledger.waveClears).toEqual([1, 2]);
    expect(ledger.waveStarts).toEqual([2]);
    expect(ledger.exited.length).toBe(alive + 32);
    expect(s.lives).toBe(1000 - 20 - 32);
    expect(s.gold).toBe(goldBefore + 25 + 20 + 25);
    expect(s.phase).toBe('setup');
    expect(s.specialCharges).toBe(0);
    expect(emptyTicksInWave).toBe(0);
  });

  it('with a tower: old-wave enemies killed after the call pay their bounty and count for the tower', () => {
    const s = createGame();
    s.lives = 1000;
    expect(buildTower(s, { col: 9, row: 5 }, 'longbow').ok).toBe(true);
    // Milestone 25c second pass: 19 hp Goblins; upgraded (9 damage) so it still kills old-wave enemies after the call.
    expect(upgradeTower(s, { col: 9, row: 5 }).ok).toBe(true);
    startWave(s);
    while (s.waveTick <= lastSpawnTick(1)) tick(s);
    const oldIds = new Set(s.enemies.map((e) => e.id));
    expect(oldIds.size).toBeGreaterThan(0);
    const ledger = newLedger();
    between(s, ledger, () => callNextWave(s));
    while (running(s)) step(s, ledger);
    const oldKilled = ledger.kills.filter((k) => oldIds.has(k.id));
    expect(oldKilled.length).toBeGreaterThan(0);
    expect(ledger.bounties).toBe(ledger.kills.length * ENEMY_STATS.goblin.bounty);
    for (const id of oldIds) expect(ledger.kills.filter((k) => k.id === id).length + ledger.exited.filter((x) => x === id).length).toBe(1);
    expect(ledger.waveClears).toEqual([1, 2]);
  });

  it('the special charge: spent before the call, the call gives 1; unused before the call, it stays 1; the called wave\'s clear takes it away', () => {
    const spent = justSpawned(1);
    expect(useSpecial(spent, 'keg', { x: 0, y: 0 }).ok).toBe(true);
    expect(spent.specialCharges).toBe(0);
    callNextWave(spent);
    expect(spent.specialCharges).toBe(1);
    const unused = justSpawned(1);
    expect(unused.specialCharges).toBe(1);
    callNextWave(unused);
    expect(unused.specialCharges).toBe(1);
    while (running(unused)) tick(unused);
    expect(unused.specialCharges).toBe(0);
  });

  it('a special unlocks by the called wave: Tar Barrel is refused on wave 3 and usable right after calling wave 4', () => {
    const s = justSpawned(3);
    expect(useSpecial(s, 'tarBarrel', { x: 100, y: 240 }).ok).toBe(false);
    expect(callNextWave(s)).toMatchObject({ ok: true, wave: 4 });
    expect(useSpecial(s, 'tarBarrel', { x: 100, y: 240 }).ok).toBe(true);
  });

  it('losing during a called wave: lost at once, no waveClear for the called wave, further calls are game-over', () => {
    const s = justSpawned(1, 25);
    const ledger = newLedger();
    between(s, ledger, () => callNextWave(s));
    while (running(s)) step(s, ledger);
    expect(s.phase).toBe('lost');
    expect(s.wave).toBe(2);
    expect(ledger.waveClears).toEqual([1]);
    expect(ledger.lost).toBe(1);
    expect(ledger.won).toBe(0);
    const copy = structuredClone(s);
    expect(callNextWave(s)).toEqual({ ok: false, reason: 'game-over' });
    tick(s);
    expect(s).toEqual(copy);
  });

  it('a kept clear bonus cannot be farmed: the gold from calling wave 2 at +0 is at most 20 more than waiting', () => {
    const wait = justSpawned(1);
    while (running(wait)) tick(wait);
    startWave(wait);
    while (running(wait)) tick(wait);
    const call = justSpawned(1);
    callNextWave(call);
    while (running(call)) tick(call);
    expect(call.gold - wait.gold).toBe(20);
    expect(call.lives).toBe(wait.lives);
  });
});

/** A hand-made wave state with one enemy and every wave 4 enemy already spawned (so no spawns interfere). */
function arena(type: EnemyType, distance: number): { s: GameState; e: Enemy } {
  const s = createGame();
  s.lives = 1e6;
  s.gold = 10000;
  s.wave = 4;
  s.phase = 'wave';
  s.waveTick = 5000;
  s.specialCharges = 1;
  s.spawnedPerGroup = WAVES[3].groups.map((g) => g.count);
  const e: Enemy = { id: 0, type, hp: 1e6, distance, slow: 0, slowTicksLeft: 0, specialSlow: 0, specialSlowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
  s.enemies.push(e);
  s.nextEnemyId = 1;
  return { s, e };
}

/** Tick once and return the slow the enemy actually moved at, from its distance. */
function movedAt(s: GameState, e: Enemy): number {
  const before = e.distance;
  tick(s);
  const full = ENEMY_STATS[e.type].speed / 60;
  return Math.round((1 - (e.distance - before) / full) * 1e6) / 1e6 + 0;
}

describe('E6. special slow channel through a real Tar Pit and a real Tar Barrel', () => {
  // The combo's Tar Pit cell (14,10), centre (464, 336); the path point at
  // distance 804 is (420, 336), 44 px away, inside the upgraded 105 px range.
  const PIT: Cell = { col: 14, row: 10 };
  const D = 804;

  function withPit(type: EnemyType) {
    const a = arena(type, D);
    expect(positionAlongPath(MAPS.meadow, D)).toEqual({ x: 420, y: 336 });
    expect(buildTower(a.s, PIT, 'tarpit').ok).toBe(true);
    expect(upgradeTower(a.s, PIT).ok).toBe(true);
    return a;
  }
  const barrel = (s: GameState, e: Enemy) => {
    const p = enemyPosition(e, MAPS.meadow);
    expect(useSpecial(s, 'tarBarrel', p)).toMatchObject({ ok: true });
  };

  it('Tar Pit first, then the barrel: the barrel lands (not wasted), 0.6 wins while both last, and after the Pit is sold the barrel\'s 0.5 runs to tick 210 exactly', () => {
    const { s, e } = withPit('troll');
    tick(s); // the Pit fires: 0.6 for 120 ticks
    expect([e.slow, e.slowTicksLeft]).toEqual([0.6, 120]);
    barrel(s, e);
    expect([e.specialSlow, e.specialSlowTicksLeft]).toEqual([0.5, 210]);
    expect([e.slow, e.slowTicksLeft]).toEqual([0.6, 120]);
    const seen: number[] = [];
    for (let i = 0; i < 60; i++) seen.push(movedAt(s, e));
    expect(new Set(seen)).toEqual(new Set([0.6]));
    expect(sellTower(s, PIT).ok).toBe(true);
    const towerLeft = e.slowTicksLeft;
    expect(towerLeft).toBeGreaterThan(0);
    for (let i = 0; i < towerLeft; i++) expect(movedAt(s, e), `tower slot tick ${i}`).toBe(0.6);
    const barrelLeft = e.specialSlowTicksLeft!;
    expect(barrelLeft).toBe(210 - 60 - towerLeft);
    expect(barrelLeft).toBeGreaterThan(0);
    for (let i = 0; i < barrelLeft; i++) expect(movedAt(s, e), `barrel tick ${i}`).toBe(0.5);
    expect(movedAt(s, e)).toBe(0);
    expect(isTarred(e)).toBe(false);
  });

  it('the barrel first, then the Tar Pit: the Pit\'s 0.6 takes over at once, does not shorten the barrel, and the barrel is back when the Pit\'s slow ends', () => {
    const { s, e } = arena('troll', D);
    barrel(s, e);
    for (let i = 0; i < 30; i++) expect(movedAt(s, e)).toBe(0.5);
    expect(buildTower(s, PIT, 'tarpit').ok).toBe(true);
    expect(upgradeTower(s, PIT).ok).toBe(true);
    expect(movedAt(s, e)).toBe(0.5); // the Pit fires during this tick, after movement
    expect([e.slow, e.slowTicksLeft]).toEqual([0.6, 120]);
    expect(e.specialSlowTicksLeft).toBe(210 - 31);
    expect(movedAt(s, e)).toBe(0.6);
    expect(sellTower(s, PIT).ok).toBe(true);
    for (let i = 0; i < 119; i++) expect(movedAt(s, e)).toBe(0.6);
    // 31 + 1 + 119 = 151 ticks of the barrel used; 59 left at 0.5.
    expect(e.specialSlowTicksLeft).toBe(59);
    for (let i = 0; i < 59; i++) expect(movedAt(s, e)).toBe(0.5);
    expect(movedAt(s, e)).toBe(0);
  });

  it('a weaker tower slow under the barrel: 0.5 while the barrel lasts, then the tower slot\'s 0.4 still applies', () => {
    const { s, e } = arena('troll', D);
    barrel(s, e);
    for (let i = 0; i < 200; i++) movedAt(s, e);
    expect(applySlow(e, 0.4, 120)).toBe(0.4);
    for (let i = 0; i < 10; i++) expect(movedAt(s, e)).toBe(0.5);
    for (let i = 0; i < 110; i++) expect(movedAt(s, e)).toBe(0.4);
    expect(movedAt(s, e)).toBe(0);
  });

  it('the boss: 0.3 with the Pit, with the barrel, and with both; never more', () => {
    const { s, e } = withPit('boss');
    tick(s);
    expect(e.slow).toBe(0.3);
    barrel(s, e);
    expect(e.specialSlow).toBe(0.3);
    expect(s.events.filter((ev) => ev.kind === 'slowed').slice(-1)).toEqual([{ kind: 'slowed', enemyId: 0, slow: 0.3, ticks: 210 }]);
    for (let i = 0; i < 300; i++) {
      const slow = movedAt(s, e);
      expect(slow).toBeLessThanOrEqual(0.3);
      if (i < 230) expect(slow).toBe(0.3);
    }
    // Slots written by hand above the cap are still capped when read.
    e.slow = 0.6;
    e.slowTicksLeft = 10;
    e.specialSlow = 0.9;
    e.specialSlowTicksLeft = 10;
    expect(effectiveSlow(e)).toBe(0.3);
  });

  it('the barrel reaches 90 px and not 90.01, and is the DESIGN.md 0.5 for 210 ticks', () => {
    expect(SPECIAL_DEFS.tarBarrel).toMatchObject({ radius: 90, slow: 0.5, slowTicks: 210 });
    const a = arena('goblin', 100);
    expect(useSpecial(a.s, 'tarBarrel', { x: 100, y: 240 + 90.01 })).toMatchObject({ ok: true });
    expect(a.e.specialSlowTicksLeft).toBe(0);
    const b = arena('goblin', 100);
    expect(useSpecial(b.s, 'tarBarrel', { x: 100, y: 240 + 90 })).toMatchObject({ ok: true });
    expect(b.e.specialSlowTicksLeft).toBe(210);
  });
});

describe('E7. burn kill credit when the owner is sold', () => {
  // Fire Pot (14,9), centre (464, 304): the path point (420, 304) at distance 772 is 44 px away.
  const POT: Cell = { col: 14, row: 9 };

  function burning() {
    const { s, e } = arena('goblin', 772);
    e.hp = 6;
    expect(buildTower(s, POT, 'firepot').ok).toBe(true);
    tick(s); // impact 4, burn 5/s for 180 ticks owned by (14,9)
    expect(e.hp).toBe(2);
    expect(e.burnOwner).toEqual(POT);
    return { s, e };
  }

  it('the owner stands: its burn kill counts for it', () => {
    const { s } = burning();
    const pot = towerAt(s, POT)!;
    pot.cooldownTicks = 1e6; // no second impact: the burn alone must kill
    while (s.enemies.length > 0) tick(s);
    expect(pot.kills).toBe(1);
  });

  it('the owner is sold before the enemy dies: the kill counts for nobody (DESIGN.md "Selling a tower clears its burns\' ownership"), but still pays the bounty', () => {
    const { s } = burning();
    expect(sellTower(s, POT).ok).toBe(true);
    const gold = s.gold;
    let kill: GameEvent | undefined;
    while (s.enemies.length > 0) {
      tick(s);
      kill = s.events.find((ev) => ev.kind === 'kill') ?? kill;
    }
    expect(kill).toMatchObject({ kind: 'kill', cause: 'burn', bounty: ENEMY_STATS.goblin.bounty });
    expect(s.gold - gold).toBe(ENEMY_STATS.goblin.bounty + WAVE_CLEAR_BONUS);
    expect(s.towers).toEqual([]);
  });

  it('sold and a new tower built on the same cell: the new tower does not inherit the old burn\'s kill', () => {
    const { s } = burning();
    expect(sellTower(s, POT).ok).toBe(true);
    expect(buildTower(s, POT, 'longbow').ok).toBe(true);
    towerAt(s, POT)!.cooldownTicks = 1e6;
    while (s.enemies.length > 0) tick(s);
    expect(towerAt(s, POT)!.kills).toBe(0);
  });
});

describe('E8. determinism: byte-equal final state', () => {
  for (const level of DIFFICULTIES) {
    it(`${level}: comboBuild, lazyBuild, noAntiAir and hardBuild, recorded and played twice, give the same JSON`, () => {
      for (const name of ['comboBuild', 'lazyBuild', 'noAntiAir', 'hardBuild']) {
        const archetype = ARCHETYPES[name];
        const a = playScripted(archetype(level), undefined, level);
        const b = playScripted(archetype(level), undefined, level);
        expect(JSON.stringify(b.state), name).toBe(JSON.stringify(a.state));
        expect(JSON.stringify(b.waves), name).toBe(JSON.stringify(a.waves));
      }
    });
  }

  it('the path is 1584 px (the exit distance the probes above rely on)', () => {
    expect(pathLength(MAPS.meadow)).toBe(1584);
  });
});

describe('E9. the next wave\'s clear waits for old-wave survivors (DESIGN.md said no clear check waits for them)', () => {
  it('a wave 1 straggler that outlives every wave 2 enemy keeps wave 2 running; wave 2 clears on the tick the straggler leaves', () => {
    const s = justSpawned(1);
    callNextWave(s);
    // Hold one wave 1 Goblin far back by hand so it outlasts wave 2 (in play: a slowed Troll behind a fast wave).
    const straggler = s.enemies[s.enemies.length - 1];
    straggler.distance = -3000;
    const wave2Ids = new Set<number>();
    let aloneTicks = 0;
    let clearedAt = -1;
    while (running(s)) {
      tick(s);
      for (const e of s.events) if (e.kind === 'spawn') wave2Ids.add(e.enemyId);
      if (s.phase === 'wave' && s.enemies.length === 1 && s.enemies[0].id === straggler.id && wave2Ids.size === 32) aloneTicks += 1;
      if (s.events.some((e) => e.kind === 'waveClear')) clearedAt = s.waveTick;
    }
    expect(wave2Ids.size).toBe(32);
    // Every wave 2 enemy had spawned and gone for a long time before the wave cleared.
    expect(aloneTicks).toBeGreaterThan(1000);
    expect(s.events).toContainEqual({ kind: 'exit', enemyId: straggler.id });
    expect(s.events).toContainEqual({ kind: 'waveClear', wave: 2, bonus: 25 });
    expect(clearedAt).toBeGreaterThan(lastSpawnTick(2) + 1584);
    expect(s.phase).toBe('setup');
  });
});

describe('B. the DESIGN.md wave table, transcribed by the verifier (no other test pins every group)', () => {
  const g = (type: EnemyType, count: number, interval: number, delay = 0) => ({ type, count, interval, delay });
  // docs/DESIGN.md "Waves": groups, then enemies, total hp, bounty.
  const TABLE: [ReturnType<typeof g>[], number, number, number][] = [
    // Milestone 25c second pass (longer, sparser waves); milestone 28: wave 1 every 2.5 s, Goblin 23 hp, Troll 950.
    [[g('goblin', 20, 2.5)], 20, 460, 40],
    [[g('goblin', 32, 0.9)], 32, 736, 64],
    [[g('goblin', 22, 1.0), g('wolf', 12, 1.5, 4.5)], 34, 746, 68],
    [[g('harpy', 10, 1.5), g('goblin', 30, 1.0, 3)], 40, 1050, 90],
    [[g('goblin', 40, 1.0), g('troll', 3, 8, 10), g('harpy', 10, 1.2, 8)], 53, 4130, 134],
    [[g('goblin', 45, 1.0), g('wolf', 35, 1.0, 9), g('shieldbearer', 6, 1.5, 0.5)], 86, 2155, 190],
    [[g('wolf', 26, 1.5), g('troll', 13, 4.5, 1), g('harpy', 16, 1.0, 8)], 55, 13446, 204],
    [[g('goblin', 50, 1.5), g('wolf', 25, 1.5, 6.75), g('troll', 13, 5, 3), g('shieldbearer', 6, 6, 4), g('harpy', 14, 1.2, 10)], 108, 14924, 326],
    [[g('wolf', 30, 1.0), g('troll', 10, 2, 2)], 40, 10100, 140],
    [[g('wolf', 20, 1.5, 4), g('troll', 15, 4.5), g('harpy', 12, 1.5, 6), g('shieldbearer', 8, 5, 2.5), g('boss', 1, 0, 65)], 56, 19642, 386],
  ];

  it('every group of every wave, and each wave\'s enemies, total hp and bounty', () => {
    expect(WAVES.map((w) => w.groups)).toEqual(TABLE.map((row) => row[0]));
    WAVES.forEach((w, i) => {
      const [, enemies, hp, bounty] = TABLE[i];
      expect(w.groups.reduce((n, x) => n + x.count, 0), `wave ${i + 1} enemies`).toBe(enemies);
      expect(w.groups.reduce((n, x) => n + x.count * ENEMY_STATS[x.type].hp, 0), `wave ${i + 1} hp`).toBe(hp);
      expect(w.groups.reduce((n, x) => n + x.count * ENEMY_STATS[x.type].bounty, 0), `wave ${i + 1} bounty`).toBe(bounty);
    });
    expect(TABLE.reduce((n, row) => n + row[1], 0)).toBe(524);
  });

  it('enemy hp and bounty, Fire Arrows, Easy lives and the Hard multiplier as DESIGN.md states them', () => {
    const stat = (t: EnemyType) => [ENEMY_STATS[t].hp, ENEMY_STATS[t].speed, ENEMY_STATS[t].bounty];
    expect(stat('goblin')).toEqual([23, 60, 2]);
    expect(stat('wolf')).toEqual([20, 120, 2]);
    expect(stat('troll')).toEqual([950, 35, 8]);
    expect(stat('harpy')).toEqual([36, 90, 3]);
    expect(stat('shieldbearer')).toEqual([70, 45, 5]);
    expect(stat('boss')).toEqual([4000, 25, 150]);
    expect(SPECIAL_DEFS.fireArrows).toMatchObject({ unlockWave: 7, radius: 80, burnDps: 30, burnTicks: 240 });
    expect(DIFFICULTY_DEFS).toEqual({
      easy: { hpMultiplier: 0.75, startGold: 150, startLives: 30 },
      normal: { hpMultiplier: 1, startGold: 100, startLives: 20 },
      hard: { hpMultiplier: 1.2, startGold: 80, startLives: 15 },
    });
  });

  it('every wave\'s last spawn (milestone 25c second pass: within 90 s, wave 8 the longest at 73.5 s)', () => {
    const secs = WAVES.map((_, i) => lastSpawnTick(i + 1) / 60);
    expect(secs).toEqual([47.5, 27.9, 21, 32, 39, 44, 55, 73.5, 29, 65]);
  });
});

// Second pass (longer, sparser waves): the verifier's own checks of the new
// wave rule and of what tar still does.
describe('S1. spawn rate (A1), from the merged schedule of all groups of a wave', () => {
  /** Spawn ticks of every walker (or flyer) of wave index `w`, all groups merged, ascending. */
  const merged = (w: number, flying: boolean) =>
    WAVES[w].groups
      .filter((x) => ENEMY_STATS[x.type].flying === flying)
      .flatMap((x) => Array.from({ length: x.count }, (_, i) => Math.round((x.delay + i * x.interval) * 60)))
      .sort((a, b) => a - b);
  /** The most spawns in any window of `span` ticks starting on a spawn; `closed` also counts a spawn exactly `span` later. */
  const most = (ticks: number[], span: number, closed: boolean) =>
    Math.max(0, ...ticks.map((t) => ticks.filter((u) => u >= t && (closed ? u <= t + span : u < t + span)).length));

  it('in any 180 ticks [t, t + 180) at most 6 walkers and 4 flyers spawn; waves 6 and 8 sit on the walker limit', () => {
    const walkers = WAVES.map((_, w) => most(merged(w, false), 180, false));
    const flyers = WAVES.map((_, w) => most(merged(w, true), 180, false));
    expect(walkers).toEqual([2, 4, 5, 3, 4, 6, 3, 6, 5, 4]);
    expect(flyers).toEqual([0, 0, 0, 2, 3, 0, 3, 3, 0, 2]);
    for (const n of walkers) expect(n).toBeLessThanOrEqual(6);
    for (const n of flyers) expect(n).toBeLessThanOrEqual(4);
  });

  // The rule holds only with the window's far edge left out. Groups on whole
  // seconds line up, so two spawns exactly 3.0 s apart are common: counting
  // both ends, waves 3, 6 and 8 send 7, 8 and 7 walkers in 3 s.
  it('with both ends of the 3 s counted the walker counts are higher: 7, 8 and 7 on waves 3, 6 and 8 (pinned, not a limit)', () => {
    expect(WAVES.map((_, w) => most(merged(w, false), 180, true))).toEqual([2, 4, 7, 4, 5, 8, 4, 7, 6, 5]);
    expect(WAVES.map((_, w) => most(merged(w, true), 180, true))).toEqual([0, 0, 0, 3, 3, 0, 4, 3, 0, 3]);
  });
});

describe('S2. what tar still does (no balance test pins it)', () => {
  const run = (name: string, level: 'easy' | 'normal') => playScripted(ARCHETYPES[name](level), undefined, level);

  // Milestone 28 numbers: both lose on wave 7 (8 before).
  it('Tar Pit, Normal: soundBuild and soundBuildNoTar both lose on wave 7, but with tar it has 9 lives after wave 6 against 4, and its wave 7 lasts 1890 ticks longer', () => {
    const tar = run('soundBuild', 'normal');
    const none = run('soundBuildNoTar', 'normal');
    expect([tar.state.phase, tar.state.wave, none.state.phase, none.state.wave]).toEqual(['lost', 7, 'lost', 7]);
    expect([tar.waves[5].lives, none.waves[5].lives]).toEqual([9, 4]);
    expect([tar.waves[6].ticks, none.waves[6].ticks]).toEqual([5477, 3587]);
    expect(tar.waves[6].ticks).toBeGreaterThan(none.waves[6].ticks);
  });

  it('Tar Pit, Easy: soundBuild wins with 6 lives and soundBuildNoTar loses on wave 10', () => {
    const tar = run('soundBuild', 'easy');
    const none = run('soundBuildNoTar', 'easy');
    expect([tar.state.phase, tar.state.lives]).toEqual(['won', 6]);
    expect([none.state.phase, none.state.wave]).toEqual(['lost', 10]);
  });
  // Milestone 28: the Tar Barrel probe ("ends the same without its three
  // barrels") is folded into balance.suite.ts T9, which now requires the
  // opposite: without its barrels the combo does strictly worse.
});
