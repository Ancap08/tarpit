// Milestone 25c: call the next wave early (docs/SCOPE-v4.md 25c). Rules in
// game.ts callEarlyStatus / callNextWave; headless timed action
// { type: 'callEarly', atWaveTick }.
import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import {
  callEarlyStatus,
  callNextWave,
  createGame,
  EARLY_CALL_GRACE_SECONDS,
  EARLY_CALL_MAX_BONUS,
  lastSpawnTick,
  spawnTick,
  startWave,
  tick,
  WAVE_CLEAR_BONUS,
} from './game';
import { ENEMY_STATS, isBoss } from './enemies';
import { applyScriptBoon, comboBuild, playScripted, type TimedAction, type WaveScript } from './headless';
import type { GameState } from './types';
import { WAVES } from './waves';

/** A Normal game in wave `wave`, lives too high to lose, run until its last enemy has spawned. */
function afterLastSpawn(wave: number): GameState {
  const s = createGame();
  s.lives = 1e6;
  s.wave = wave - 1;
  startWave(s);
  while (s.waveTick <= lastSpawnTick(wave)) tick(s);
  return s;
}

describe('constants and helpers', () => {
  it('20 s grace, at most 20 gold', () => {
    expect([EARLY_CALL_GRACE_SECONDS, EARLY_CALL_MAX_BONUS]).toEqual([20, 20]);
  });

  it('lastSpawnTick is the latest spawn tick over the wave\'s groups', () => {
    for (let w = 1; w <= WAVES.length; w++) {
      const want = Math.max(...WAVES[w - 1].groups.map((g) => spawnTick(g, g.count - 1)));
      expect(lastSpawnTick(w)).toBe(want);
    }
  });
});

describe('refusals, in order', () => {
  it('game-over, then not-in-wave, then last-wave, then still-spawning', () => {
    const over = createGame();
    over.phase = 'lost';
    expect(callNextWave(over)).toEqual({ ok: false, reason: 'game-over' });
    over.phase = 'won';
    expect(callNextWave(over)).toEqual({ ok: false, reason: 'game-over' });
    const setup = createGame();
    expect(callNextWave(setup)).toEqual({ ok: false, reason: 'not-in-wave' });
    const spawning = createGame();
    startWave(spawning);
    tick(spawning);
    expect(callNextWave(spawning)).toEqual({ ok: false, reason: 'still-spawning' });
  });

  it('the last wave cannot call, and the wave before the boss wave cannot call it (the boss is never called early)', () => {
    const bossWave = WAVES.findIndex((w) => w.groups.some((g) => isBoss(g))) + 1;
    expect(bossWave).toBe(10);
    expect(callNextWave(afterLastSpawn(20))).toEqual({ ok: false, reason: 'last-wave' });
    expect(callNextWave(afterLastSpawn(19))).toEqual({ ok: false, reason: 'last-wave' });
    // Even while wave 19 is still spawning, last-wave comes first.
    const s = createGame();
    s.wave = 18;
    startWave(s);
    expect(callEarlyStatus(s)).toEqual({ ok: false, reason: 'last-wave' });
    expect(callEarlyStatus(afterLastSpawn(18)).ok).toBe(true);
  });

  it('a refusal changes nothing', () => {
    const s = createGame();
    startWave(s);
    tick(s);
    const before = JSON.stringify(s);
    callNextWave(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('the early bonus: min(20, ceil(20 - seconds since the last spawn))', () => {
  it('20 right after the last spawn and through tick 59, 19 at 60 ticks, 18 at 120, 1 at 1199', () => {
    const s = afterLastSpawn(1);
    // Ticks after the last spawn's tick (waveTick = lastSpawnTick + 1 + n).
    const at = (n: number) => {
      const t = structuredClone(s);
      for (let i = 0; i < n; i++) tick(t);
      return callEarlyStatus(t);
    };
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(at(0)).toEqual({ ok: true, bonus: 20 });
    expect(at(59)).toEqual({ ok: true, bonus: 20 });
    expect(at(60)).toEqual({ ok: true, bonus: 19 });
    expect(at(61)).toEqual({ ok: true, bonus: 19 });
    expect(at(120)).toEqual({ ok: true, bonus: 18 });
    expect(at(1199)).toEqual({ ok: true, bonus: 1 });
  });

  it('0 once the 20 s are over: the call is still allowed and pays only the clear bonus', () => {
    const s = afterLastSpawn(1);
    s.enemies.forEach((e) => (e.hp = 1e9));
    for (let i = 0; i < 1200; i++) tick(s);
    if (s.phase !== 'wave') throw new Error('wave 1 ended before 20 s');
    expect(callEarlyStatus(s)).toEqual({ ok: true, bonus: 0 });
    const gold = s.gold;
    expect(callNextWave(s)).toEqual({ ok: true, wave: 2, bonus: 0, gold: gold + WAVE_CLEAR_BONUS });
  });
});

describe('calling the next wave', () => {
  it('clears the current wave at once (25 + early bonus), starts the next schedule on top of the survivors, grants a fresh charge', () => {
    const s = afterLastSpawn(1);
    useSpecial(s, 'keg', { x: 0, y: 0 }); // spend the charge
    expect(s.specialCharges).toBe(0);
    const survivors = s.enemies.map((e) => e.id);
    const gold = s.gold;
    s.events = [];
    const r = callNextWave(s);
    expect(r).toEqual({ ok: true, wave: 2, bonus: 20, gold: gold + 25 + 20 });
    expect(s.events).toEqual([
      { kind: 'waveClear', wave: 1, bonus: 25 },
      { kind: 'earlyCall', wave: 2, bonus: 20 },
      { kind: 'waveStart', wave: 2 },
    ]);
    expect({ wave: s.wave, phase: s.phase, waveTick: s.waveTick, specialCharges: s.specialCharges }).toEqual({
      wave: 2,
      phase: 'wave',
      waveTick: 0,
      specialCharges: 1,
    });
    expect(s.spawnedPerGroup).toEqual(WAVES[1].groups.map(() => 0));
    expect(s.enemies.map((e) => e.id)).toEqual(survivors);
    // The next tick spawns wave 2's first enemy alongside them.
    tick(s);
    expect(s.events.filter((e) => e.kind === 'spawn')).toHaveLength(WAVES[1].groups.filter((g) => g.delay === 0).length);
  });

  it('an unused charge is not added to: still 1', () => {
    const s = afterLastSpawn(1);
    expect(s.specialCharges).toBe(1);
    callNextWave(s);
    expect(s.specialCharges).toBe(1);
  });

  it('towers stay locked; a tower built mid-wave was locked already', () => {
    const s = createGame();
    buildTower(s, { col: 7, row: 5 }, 'musketeer');
    startWave(s);
    buildTower(s, { col: 9, row: 5 }, 'longbow');
    while (s.waveTick <= lastSpawnTick(1)) tick(s);
    if (s.phase !== 'wave') throw new Error('wave 1 ended before its last spawn');
    expect(callNextWave(s).ok).toBe(true);
    expect(s.towers.map((t) => t.locked)).toEqual([true, true]);
  });

  it('survivors still exit and cost lives; each wave pays its clear bonus once; the game is won only after wave 20', () => {
    // No towers, lives too high to lose: call every eligible wave as soon as it may.
    const s = createGame();
    s.lives = 2000;
    const clears: number[] = [];
    let calls = 0;
    let exits = 0;
    let spawns = 0;
    const running = () => s.phase === 'wave';
    for (let w = 1; w <= 20 && s.phase === 'setup'; w++) {
      applyScriptBoon(s);
      startWave(s);
      while (running()) {
        if (callEarlyStatus(s).ok) {
          calls += 1;
          s.events = [];
          callNextWave(s);
          for (const e of s.events) if (e.kind === 'waveClear') clears.push(e.wave);
        }
        tick(s);
        for (const e of s.events) {
          if (e.kind === 'waveClear') clears.push(e.wave);
          if (e.kind === 'exit') exits += 1;
          if (e.kind === 'spawn') spawns += 1;
        }
      }
    }
    expect(calls).toBe(12);
    expect(clears).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    const total = WAVES.reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0);
    expect(spawns).toBe(total);
    expect(exits).toBe(total);
    const loss = WAVES.flatMap((wave) => wave.groups).reduce((n, g) => n + g.count * ENEMY_STATS[g.type].livesCost, 0);
    expect(s.lives).toBe(2000 - loss + 4); // The default wave-15 choice adds three lives.
    expect(s.phase).toBe('won');
  });
});

describe('headless: timed callEarly', () => {
  /** comboBuild with a callEarly after the last spawn of each eligible wave. */
  function comboCalling(): WaveScript {
    const timed: TimedAction[][] = WAVES.map((_, i) => ([1, 2, 3, 6, 7, 8, 11, 12, 13, 16, 17, 18].includes(i + 1) ? [{ type: 'callEarly', atWaveTick: lastSpawnTick(i + 1) + 1 }] : []));
    const script = comboBuild();
    return Object.assign([...script], { timed, boons: script.boons });
  }

  it('calls fire at their wave tick and are accepted; a call before the last spawn is refused still-spawning', () => {
    const run = playScripted(comboCalling());
    const calls = run.log.filter((l) => l.action === 'callEarly');
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).toMatchObject({ result: { ok: true, bonus: 20 } });
    expect(run.waves.map((w) => w.wave)).toEqual(run.waves.map((_, i) => i + 1));
    const early = Object.assign([[]], { timed: [[{ type: 'callEarly' as const, atWaveTick: 5 }]] });
    const r = playScripted(early);
    expect(r.log.find((l) => l.action === 'callEarly')).toMatchObject({ waveTick: 5, result: { ok: false, reason: 'still-spawning' } });
  });

  it('is deterministic, and kills + exits = spawns, no id twice', () => {
    const a = playScripted(comboCalling());
    const b = playScripted(comboCalling());
    expect(b.state).toEqual(a.state);
    expect(b.waves).toEqual(a.waves);
    expect(b.log).toEqual(a.log);
  });

  it('kills + exits = spawns over a tick-by-tick replay with calls', () => {
    const s = createGame();
    s.lives = 2000;
    const script = comboBuild();
    const seen = new Set<number>();
    let gone = 0;
    const running = () => s.phase === 'wave';
    for (let w = 0; w < 20 && s.phase === 'setup'; w++) {
      applyScriptBoon(s, script);
      for (const a of script[w] ?? []) if (a.type === 'build') buildTower(s, a.cell, a.tower);
      startWave(s);
      while (running()) {
        if (callEarlyStatus(s).ok) callNextWave(s);
        tick(s);
        for (const e of s.events) {
          if (e.kind === 'spawn') {
            expect(seen.has(e.enemyId)).toBe(false);
            seen.add(e.enemyId);
          }
          if (e.kind === 'kill' || e.kind === 'exit') gone += 1;
        }
      }
    }
    expect(gone + s.enemies.length).toBe(seen.size);
  });
});
