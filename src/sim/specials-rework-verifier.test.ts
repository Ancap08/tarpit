// Independent verifier probes for milestone 30 (specials rework). Written by
// the verifier (a different model from the implementer); each test asks one
// question the milestone's own tests could have missed.
import { describe, expect, it } from 'vitest';
import { CHEAT_GOLD, grantCheatGold, useSpecial } from './actions';
import type { GameEvent } from './events';
import { callNextWave, continueEndless, createGame, startWave, tick } from './game';
import { applyAction, applyScriptBoon, comboBuild, endlessIdle, type WaveScript } from './headless';
import { SPECIAL_RECHARGE_TICKS } from './specials';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { WAVES } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const enemy = (id: number, type: EnemyType, distance: number, hp: number): Enemy => ({ id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 });
const ticks = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) tick(s);
};
/** A started wave `wave` on a straight line with `enemies` already spawned and alive, never exiting soon. */
function arena(wave: number, enemies: Enemy[]): GameState {
  const s = createGame({ map: LINE });
  s.wave = wave - 1;
  startWave(s);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 500;
  s.lives = 1000;
  return s;
}
const P = { x: 300, y: 240 };

describe('verifier: the charge', () => {
  it('is ready at wave start, spent by firing, ready again exactly 1200 wave ticks later, not before', () => {
    const s = arena(1, [enemy(0, 'troll', 100, 1e9)]);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([1, 0]);
    expect(useSpecial(s, 'keg', P).ok).toBe(true);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([0, SPECIAL_RECHARGE_TICKS]);
    ticks(s, SPECIAL_RECHARGE_TICKS - 1);
    expect(s.specialCharges).toBe(0);
    expect(useSpecial(s, 'keg', P)).toEqual({ ok: false, reason: 'no-charge' });
    tick(s);
    expect(s.specialCharges).toBe(1);
    expect(useSpecial(s, 'keg', P).ok).toBe(true);
  });

  it('cannot be fired twice in one tick', () => {
    const s = arena(1, [enemy(0, 'troll', 100, 1e9)]);
    expect(useSpecial(s, 'keg', P).ok).toBe(true);
    expect(useSpecial(s, 'keg', P)).toEqual({ ok: false, reason: 'no-charge' });
    expect(useSpecial(s, 'keg', P)).toEqual({ ok: false, reason: 'no-charge' });
  });

  it('does not recharge in setup and is refused there; a call-early makes it ready at once', () => {
    const s = arena(1, [enemy(0, 'troll', 100, 1e9)]);
    useSpecial(s, 'keg', P);
    ticks(s, 100);
    expect(s.specialRechargeTicks).toBe(SPECIAL_RECHARGE_TICKS - 100);
    // Force setup (as after a clear): the clear zeroes both; ticking in setup changes nothing.
    s.phase = 'setup';
    s.specialCharges = 0;
    s.specialRechargeTicks = 0;
    ticks(s, 2000);
    expect([s.specialCharges, s.specialRechargeTicks]).toEqual([0, 0]);
    expect(useSpecial(s, 'keg', P)).toEqual({ ok: false, reason: 'not-in-wave' });
  });

  it('is ready at once after an early call, even with the recharge half run', () => {
    const s = arena(1, [enemy(0, 'troll', 100, 1e9)]);
    useSpecial(s, 'keg', P);
    ticks(s, 600);
    s.spawnedPerGroup = WAVES[0].groups.map((g) => g.count);
    expect(callNextWave(s).ok).toBe(true);
    expect([s.wave, s.specialCharges, s.specialRechargeTicks]).toEqual([2, 1, 0]);
    expect(useSpecial(s, 'keg', P).ok).toBe(true);
  });

  it('is refused when won or lost, changing nothing', () => {
    for (const phase of ['won', 'lost'] as const) {
      const s = arena(1, [enemy(0, 'troll', 100, 1e9)]);
      s.phase = phase;
      const before = JSON.stringify(s);
      expect(useSpecial(s, 'keg', P)).toEqual({ ok: false, reason: 'game-over' });
      expect(grantCheatGold(s)).toEqual({ ok: false, reason: 'game-over' });
      expect(JSON.stringify(s)).toBe(before);
    }
  });
});

describe('verifier: zones', () => {
  it('slows while inside and for the linger after leaving, then stops; flyer included', () => {
    const s = arena(4, [enemy(0, 'wolf', 190, 1e9), enemy(1, 'harpy', 190, 1e9)]);
    useSpecial(s, 'tarBarrel', { x: 300, y: 240 });
    const slowTicks: number[] = [];
    for (let i = 0; i < 400; i++) {
      tick(s);
      slowTicks.push(s.enemies[1].specialSlowTicksLeft ?? 0);
    }
    expect(s.enemies[1].distance).toBeGreaterThan(400); // harpy left the circle
    // Harpy was slowed at some point, and by the end (zone left behind it) the slow expired.
    expect(Math.max(...slowTicks)).toBe(60);
    expect(slowTicks[slowTicks.length - 1]).toBe(0);
  });

  it('a tar zone refreshes its linger through its last tick, then expires', () => {
    const s = arena(4, [enemy(0, 'troll', 130, 1e9)]);
    useSpecial(s, 'tarBarrel', { x: 225, y: 240 });
    ticks(s, 659);
    expect(s.zones[0]?.ticksLeft).toBe(1);
    tick(s);
    expect(s.zones.length).toBe(0);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(60);
    ticks(s, 59);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(1);
    tick(s);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(0);
  });

  it('two overlapping zones of one kind do not stack; tar and fire together burn double', () => {
    const s = arena(7, [enemy(0, 'troll', 300, 1e9)]);
    useSpecial(s, 'tarBarrel', P);
    useSpecial(s, 'fireArrows', P); // refused: no charge. Reset the charge as a recharge would.
    tick(s);
    s.specialCharges = 1;
    useSpecial(s, 'tarBarrel', P);
    tick(s);
    s.specialCharges = 1;
    expect(useSpecial(s, 'fireArrows', P).ok).toBe(true);
    expect(s.zones.map((z) => z.type)).toEqual(['tarBarrel', 'tarBarrel', 'fireArrows']);
    const hp0 = s.enemies[0].hp;
    tick(s);
    const e = s.enemies[0];
    expect(e.specialSlow).toBe(0.5); // two tar zones: still 0.5, not stacked
    // Burn 26/s doubled by tar = 52/s -> 52/60 hp per tick (floating: compare loosely).
    expect(hp0 - e.hp).toBeCloseTo(52 / 60, 6);
  });

  it('the boss slow stays capped at 0.3 under overlapping tar zones', () => {
    const s = arena(4, [enemy(0, 'boss', 300, 1e9)]);
    useSpecial(s, 'tarBarrel', P);
    tick(s);
    s.specialCharges = 1;
    useSpecial(s, 'tarBarrel', P);
    ticks(s, 30);
    expect(s.enemies[0].specialSlow).toBe(0.3);
  });

  it('a zone burn kill is a special kill, credited to no tower', () => {
    const s = arena(7, [enemy(0, 'goblin', 300, 5), enemy(1, 'goblin', 305, 5), enemy(2, 'goblin', 310, 5)]);
    useSpecial(s, 'fireArrows', P);
    const events: GameEvent[] = [];
    for (let i = 0; i < 60 && s.enemies.length > 0; i++) {
      tick(s);
      events.push(...s.events);
    }
    const kills = events.filter((e) => e.kind === 'kill');
    expect(kills.length).toBe(3);
    expect(kills.every((k) => k.kind === 'kill' && k.cause === 'special')).toBe(true);
    expect(s.towers.every((t) => (t.kills ?? 0) === 0)).toBe(true);
  });
});

describe('verifier: grantCheatGold', () => {
  it('adds 500, sets the flag, emits one event and changes nothing else', () => {
    const s = arena(4, [enemy(0, 'troll', 300, 1e9)]);
    tick(s);
    const before = structuredClone(s);
    const r = grantCheatGold(s);
    expect(r).toEqual({ ok: true, gold: before.gold + CHEAT_GOLD });
    const after = structuredClone(s);
    expect(after.events).toEqual([...before.events, { kind: 'cheat', gold: 500 }]);
    for (const x of [before, after]) {
      x.gold = 0;
      x.cheated = false;
      x.events = [];
    }
    expect(after).toEqual(before);
    expect(s.cheated).toBe(true);
  });
});

/** Play a recorded script tick by tick, counting events. */
function play(script: WaveScript, endlessTo = 0) {
  const s = createGame({ map: script.mapId });
  let spawned = 0;
  let exits = 0;
  const kills = { shot: 0, burn: 0, special: 0, exit: 0 } as Record<string, number>;
  let towerKills = 0;
  let goldGained = 0;
  const invariants: string[] = [];
  const count = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.kind === 'spawn') spawned += 1;
      else if (e.kind === 'exit') exits += 1;
      else if (e.kind === 'kill') kills[e.cause] = (kills[e.cause] ?? 0) + 1;
    }
  };
  for (let i = 0; i < 40 && s.phase === 'setup'; i++) {
    applyScriptBoon(s, script);
    for (const a of script[i] ?? []) applyAction(s, a);
    startWave(s);
    const timed = script.timed?.[i] ?? [];
    while ((s.phase as GameState['phase']) === 'wave') {
      for (const a of timed) {
        if (a.atWaveTick !== s.waveTick) continue;
        const from = s.events.length;
        applyAction(s, a);
        count(s.events.slice(from));
      }
      tick(s);
      count(s.events);
    }
    if (s.zones.length !== 0 || s.specialCharges !== 0 || s.specialRechargeTicks !== 0) invariants.push(`wave ${s.wave} end: zones ${s.zones.length} charge ${s.specialCharges}`);
    if ((s.phase as GameState['phase']) === 'won') {
      tick(s);
      if (s.shots.length !== 0) invariants.push('shots after win tick');
      if (endlessTo === 0 || s.wave >= endlessTo) break;
      continueEndless(s);
    }
    if (endlessTo && s.wave >= endlessTo + 1) break;
  }
  towerKills = s.towers.reduce((n, t) => n + (t.kills ?? 0), 0);
  goldGained = s.gold;
  return { s, spawned, exits, kills, towerKills, goldGained, invariants };
}

describe('verifier: conservation over a whole comboBuild game (Meadow, Normal)', () => {
  const run = play(comboBuild());
  it('spawned = shot + burn + special kills + exits', () => {
    expect(run.s.phase).toBe('won');
    const killed = Object.values(run.kills).reduce((a, b) => a + b, 0);
    expect(run.spawned).toBe(killed + run.exits);
  });
  it('tower kill counters equal shot + burn kills (special kills credit no tower; sold towers are lost)', () => {
    expect(run.towerKills).toBeLessThanOrEqual(run.kills.shot + run.kills.burn);
    expect(run.kills.special).toBeGreaterThan(0);
  });
  it('no zones, charge or shots left after any wave end or the win', () => {
    expect(run.invariants).toEqual([]);
  });
  it('two runs are identical', () => {
    const again = play(comboBuild());
    expect(JSON.stringify(again.s)).toBe(JSON.stringify(run.s));
    expect(again.kills).toEqual(run.kills);
  });
});

describe('verifier: the wave 20 to 21 endless boundary', () => {
  it('zones and charge are clean entering wave 21, and wave 21 starts with the charge ready', () => {
    const run = play(endlessIdle(), 20);
    expect(run.invariants).toEqual([]);
    const s = run.s;
    expect(s.phase).toBe('won');
    continueEndless(s);
    expect([s.zones.length, s.specialCharges, s.specialRechargeTicks]).toEqual([0, 0, 0]);
    expect(startWave(s).ok).toBe(true);
    expect([s.wave, s.specialCharges, s.specialRechargeTicks]).toEqual([21, 1, 0]);
    expect(useSpecial(s, 'fireArrows', { x: 100, y: 100 }).ok).toBe(true);
    expect(s.zones.length).toBe(1);
  });
});

