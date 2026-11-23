// Milestone 25b, verifier probes (Claude Fable 5.2). Independent of
// specials.test.ts: own geometry, exact values.
//
// Geometry: path distance d < 160 is the point (d, 240). Enemies stand at
// distance 100, so at (100, 240). Aim points:
//   (100, 170)       0 px across, 70 down    -> hypot = 70 exactly
//   (58, 184)        42 across, 56 down      -> hypot = 70 exactly (3-4-5 x 14)
//   (100, 169.99)                            -> 70.01
// Tower cell (3, 5): centre (112, 176), 64 px above the path line.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower, useSpecial } from './actions';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import { applyAction, applyScriptBoon, comboBuild, playScripted, type WaveScript } from './headless';
import { SPECIAL_TYPES } from './specials';
import { TOWER_DEFS } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

const D = 100;
const CELL = { col: 3, row: 5 };

// Arena hp: the milestone 22 values, fixed so the arithmetic below stays as
// written (milestone 25c lowered ENEMY_STATS; no special rule depends on
// an enemy's full hp). Bounties are read from ENEMY_STATS.
const ARENA_HP: Record<EnemyType, number> = { goblin: 30, wolf: 28, troll: 700, harpy: 40, shieldbearer: 120, boss: 4000, grumblemaw: 5600 };

function enemy(id: number, type: EnemyType, extra: Partial<Enemy> = {}): Enemy {
  return { id, type, hp: ARENA_HP[type], distance: D, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...extra };
}

/** Wave `wave` running, fully spawned, holding only `enemies`; optional tower at CELL built in setup. */
function inWave(wave: number, enemies: Enemy[], tower?: TowerType, upgraded = false): GameState {
  const s = createGame();
  s.wave = wave - 1;
  if (tower) {
    s.gold = 10000;
    expect(buildTower(s, CELL, tower).ok).toBe(true);
    if (upgraded) expect(upgradeTower(s, CELL).ok).toBe(true);
    s.gold = 100;
  }
  expect(startWave(s).ok).toBe(true);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 1000;
  s.events = [];
  return s;
}

const phaseOf = (s: GameState): string => s.phase;

// Milestone 30: sections (a) to (d) probed the milestone 25b numbers (keg
// 70 px and 80 damage, a 210-tick barrel slow, a 240-tick 30/s burn); they
// are replaced by the zone and radius tests in specials.test.ts.

describe('(e) charges', () => {
  it('0 in setup; 1 after startWave; 0 after use; 0 after a clear even if unused; 1 next wave, never 2', () => {
    const s = createGame();
    s.lives = 1000;
    const seen: number[] = [s.specialCharges];
    startWave(s);
    seen.push(s.specialCharges);
    useSpecial(s, 'keg', { x: 5, y: 5 });
    seen.push(s.specialCharges);
    while (phaseOf(s) === 'wave') tick(s);
    seen.push(s.specialCharges);
    startWave(s);
    seen.push(s.specialCharges);
    expect(startWave(s).ok).toBe(false); // a second Start Wave mid-wave grants nothing
    seen.push(s.specialCharges);
    while (phaseOf(s) === 'wave') tick(s); // unused
    seen.push(s.specialCharges);
    startWave(s);
    seen.push(s.specialCharges);
    expect(seen).toEqual([0, 1, 0, 0, 1, 1, 0, 1]);
  });
});

describe('(f) refusals in the documented order, state untouched', () => {
  const refused = (s: GameState, type: 'keg' | 'tarBarrel' | 'fireArrows', p: { x: number; y: number }) => {
    const before = JSON.stringify(s);
    const r = useSpecial(s, type, p);
    expect(JSON.stringify(s)).toBe(before);
    return r;
  };
  const OUT = { x: -5, y: 999 };

  it('game-over > not-in-wave > locked > no-charge > out-of-bounds', () => {
    // Everything wrong at once, peeled one layer at a time.
    for (const over of ['won', 'lost'] as const) {
      const s = inWave(3, [enemy(0, 'troll')]);
      s.specialCharges = 0;
      s.phase = over;
      expect(refused(s, 'fireArrows', OUT)).toEqual({ ok: false, reason: 'game-over' });
    }
    const setup = createGame();
    expect(refused(setup, 'fireArrows', OUT)).toEqual({ ok: false, reason: 'not-in-wave' });
    const s = inWave(3, [enemy(0, 'troll')]);
    s.specialCharges = 0;
    expect(refused(s, 'fireArrows', OUT)).toEqual({ ok: false, reason: 'locked' });
    expect(refused(s, 'tarBarrel', OUT)).toEqual({ ok: false, reason: 'locked' });
    expect(refused(s, 'keg', OUT)).toEqual({ ok: false, reason: 'no-charge' });
    s.specialCharges = 1;
    expect(refused(s, 'keg', OUT)).toEqual({ ok: false, reason: 'out-of-bounds' });
    expect(useSpecial(s, 'keg', { x: 100, y: 240 }).ok).toBe(true);
  });
});

describe('(g) unlocks keyed on state.wave', () => {
  it('tarBarrel refused during wave 3, allowed during 4; fireArrows 6 vs 7', () => {
    expect(useSpecial(inWave(3, [enemy(0, 'troll')]), 'tarBarrel', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'locked' });
    expect(useSpecial(inWave(4, [enemy(0, 'troll')]), 'tarBarrel', { x: 100, y: 240 })).toMatchObject({ ok: true, hits: 1 });
    expect(useSpecial(inWave(6, [enemy(0, 'troll')]), 'fireArrows', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'locked' });
    expect(useSpecial(inWave(7, [enemy(0, 'troll')]), 'fireArrows', { x: 100, y: 240 })).toMatchObject({ ok: true, hits: 1 });
    for (const t of SPECIAL_TYPES) expect(useSpecial(inWave(10, [enemy(0, 'troll')]), t, { x: 100, y: 240 }).ok).toBe(true);
  });
});

describe('(h) bounds', () => {
  it('x -1, 961, y -1, 481 refused; (0,0) and (960,480) allowed', () => {
    for (const p of [{ x: -1, y: 240 }, { x: 961, y: 240 }, { x: 480, y: -1 }, { x: 480, y: 481 }]) {
      const s = inWave(1, [enemy(0, 'troll')]);
      expect(useSpecial(s, 'keg', p)).toEqual({ ok: false, reason: 'out-of-bounds' });
      expect(s.specialCharges).toBe(1);
    }
    for (const p of [{ x: 0, y: 0 }, { x: 960, y: 480 }]) {
      expect(useSpecial(inWave(1, [enemy(0, 'troll')]), 'keg', p)).toMatchObject({ ok: true, hits: 0 });
    }
  });
});

describe('(i) a special on empty ground', () => {
  it('spends the charge and emits special with hits 0', () => {
    const s = inWave(1, [enemy(0, 'troll')]);
    expect(useSpecial(s, 'keg', { x: 800, y: 400 })).toEqual({ ok: true, hits: 0, kills: 0, gold: 100 });
    expect(s.events).toEqual([{ kind: 'special', type: 'keg', x: 800, y: 400, radius: 90, hits: 0 }]);
    expect(s.specialCharges).toBe(0);
    expect(useSpecial(s, 'keg', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
  });
});

/** Replay a comboBuild script tick by tick, collecting every event once. */
function replay(script: WaveScript): { state: GameState; events: GameEvent[] } {
  const s = createGame();
  const events: GameEvent[] = [];
  for (let i = 0; i < WAVES.length && phaseOf(s) === 'setup'; i++) {
    const from = s.events.length;
    applyScriptBoon(s, script);
    for (const a of script[i] ?? []) applyAction(s, a);
    expect(startWave(s).ok).toBe(true);
    events.push(...s.events.slice(from));
    while (phaseOf(s) === 'wave') {
      for (const a of script.timed?.[i] ?? []) {
        if (a.atWaveTick !== s.waveTick) continue;
        const from = s.events.length;
        applyAction(s, a);
        events.push(...s.events.slice(from));
      }
      tick(s);
      events.push(...s.events);
    }
  }
  return { state: s, events };
}

// Milestone 28: comboWithKegs is gone (its kegs hit nothing); the same
// checks run on comboBuild, whose specials (the policy's since milestone
// 30) do kill.
describe('(j) (l) a full comboBuild game with its recorded specials', () => {
  it('kills + exits == spawns, each id gone at most once; the replay equals playScripted', () => {
    const script = comboBuild('normal', undefined, { 5: 'warChest', 15: 'stoneWalls' });
    const { state, events } = replay(script);
    const reference = playScripted(script);
    expect(state).toEqual(reference.state);
    const ids = (kind: string) => events.filter((e) => e.kind === kind).map((e) => (e as { enemyId: number }).enemyId);
    const spawns = ids('spawn');
    const gone = [...ids('kill'), ...ids('exit')];
    expect(new Set(gone).size).toBe(gone.length);
    expect([...gone].sort((a, b) => a - b)).toEqual(spawns);
    expect(spawns.length).toBe(WAVES.reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0) + 8 * events.filter((e) => e.kind === 'packCall').length);
    const specials = events.filter((e) => e.kind === 'special');
    expect(specials.length).toBeGreaterThan(28);
    const specialKills = events.filter((e) => e.kind === 'kill' && e.cause === 'special');
    // Every special the policy fires catches at least 3, and some of them kill.
    for (const e of specials) expect(e.kind === 'special' && e.hits).toBeGreaterThanOrEqual(3);
    expect(specialKills.length).toBeGreaterThan(0);
    expect([state.phase, state.wave]).toEqual(['won', 20]);
    expect(state.boons).toEqual(['warChest', 'stickyTar', 'stoneWalls']);
    const packCalls = events.filter((e) => e.kind === 'packCall');
    expect(packCalls).toHaveLength(2);

    const enemyTypes = new Map(events.filter((e) => e.kind === 'spawn').map((e) => [e.enemyId, e.enemyType]));
    let { gold, lives } = createGame();
    for (const e of events) {
      if (e.kind === 'kill') gold += e.bounty;
      if (e.kind === 'waveClear' || e.kind === 'earlyCall') gold += e.bonus;
      if (e.kind === 'build') gold -= TOWER_DEFS[e.tower].cost;
      if (e.kind === 'upgrade') gold -= TOWER_DEFS[e.tower].upgradeCost;
      if (e.kind === 'sell') gold += e.refund;
      if (e.kind === 'boonPicked' && e.id === 'warChest') gold += 100;
      if (e.kind === 'boonPicked' && e.id === 'stoneWalls') lives += 3;
      if (e.kind === 'exit') lives -= ENEMY_STATS[enemyTypes.get(e.enemyId)!].livesCost;
    }
    expect(state.gold).toBe(gold);
    expect(state.lives).toBe(lives);
    expect(state.towers.reduce((n, tower) => n + tower.kills, 0) + specialKills.length + ids('exit').length).toBe(spawns.length);
  });

  it('two runs are identical (state, waves, log)', () => {
    const a = playScripted(comboBuild());
    const b = playScripted(comboBuild());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('(k) after the game ends', () => {
  it('no special after won or lost, even with a charge left', () => {
    const won = inWave(20, [enemy(0, 'boss', { hp: 1 })]);
    won.enemies[0].burnDps = 60;
    won.enemies[0].burnTicksLeft = 5;
    tick(won); // the burn kills the boss; the wave clears; won with the charge unused
    expect(phaseOf(won)).toBe('won');
    expect(won.specialCharges).toBe(0);
    won.specialCharges = 1;
    const before = JSON.stringify(won);
    expect(useSpecial(won, 'keg', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'game-over' });
    expect(JSON.stringify(won)).toBe(before);

    const lost = inWave(1, [enemy(0, 'goblin', { distance: 99999 }), enemy(1, 'troll')]);
    lost.lives = 1;
    tick(lost);
    expect(phaseOf(lost)).toBe('lost');
    expect(lost.specialCharges).toBe(1); // lost mid-wave: the charge is still there, and unusable
    const b2 = JSON.stringify(lost);
    expect(useSpecial(lost, 'keg', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'game-over' });
    expect(JSON.stringify(lost)).toBe(b2);
  });
});
