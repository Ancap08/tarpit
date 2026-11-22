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
import { enemyPosition, findTarget } from './combat';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import { applyAction, comboWithKegs, playScripted } from './headless';
import { SPECIAL_TYPES } from './specials';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

const D = 100;
const CELL = { col: 3, row: 5 };

// Arena hp: the milestone 22 values, fixed so the arithmetic below stays as
// written (milestone 25c lowered ENEMY_STATS; no special rule depends on
// an enemy's full hp). Bounties are read from ENEMY_STATS.
const ARENA_HP: Record<EnemyType, number> = { goblin: 30, wolf: 28, troll: 700, harpy: 40, shieldbearer: 120, boss: 4000 };

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

const run = (s: GameState, n: number) => {
  for (let i = 0; i < n; i++) tick(s);
};
const phaseOf = (s: GameState): string => s.phase;

describe('(a) Powder Keg radius, shield, flyer', () => {
  it('exactly 70 px takes 80 (straight and 42/56 diagonal); 70.01 takes 0', () => {
    for (const [p, lost] of [
      [{ x: 100, y: 170 }, 80],
      [{ x: 58, y: 184 }, 80],
      [{ x: 100, y: 169.99 }, 0],
      [{ x: 100, y: 310.01 }, 0],
    ] as const) {
      const s = inWave(1, [enemy(0, 'troll')]);
      expect(enemyPosition(s.enemies[0])).toEqual({ x: 100, y: 240 });
      expect(useSpecial(s, 'keg', p)).toMatchObject({ ok: true, hits: lost ? 1 : 0 });
      expect(700 - s.enemies[0].hp).toBe(lost);
    }
  });

  it('a Shieldbearer takes the full 80 (120 -> 40)', () => {
    const s = inWave(1, [enemy(0, 'shieldbearer')]);
    useSpecial(s, 'keg', { x: 100, y: 170 });
    expect(s.enemies[0].hp).toBe(40);
  });

  it('a Harpy (40 hp) takes 80, dies, pays its bounty (3 since milestone 25c) once, cause special', () => {
    const bounty = ENEMY_STATS.harpy.bounty;
    expect(bounty).toBe(3);
    const s = inWave(1, [enemy(0, 'harpy'), enemy(1, 'troll', { distance: 600 })]);
    expect(useSpecial(s, 'keg', { x: 100, y: 240 })).toEqual({ ok: true, hits: 1, kills: 1, gold: 100 + bounty });
    expect(s.events.slice(1)).toEqual([{ kind: 'kill', enemyId: 0, enemyType: 'harpy', bounty, cause: 'special' }]);
    expect(s.enemies.map((e) => e.id)).toEqual([1]);
    run(s, 5);
    expect(s.gold).toBe(100 + bounty);
  });
});

describe('(b) keg and the boss', () => {
  it('removes exactly 80 from the full boss and emits no kill or bossDown', () => {
    const s = inWave(10, [enemy(0, 'boss')]);
    useSpecial(s, 'keg', { x: 100, y: 240 });
    expect(s.enemies[0].hp).toBe(3920);
    expect(s.events.map((e) => e.kind)).toEqual(['special']);
  });

  it('kills a boss at 80 hp: one kill, one bossDown, +150, wave clears next tick, won', () => {
    const s = inWave(10, [enemy(0, 'boss', { hp: 80 })]);
    expect(useSpecial(s, 'keg', { x: 100, y: 240 })).toEqual({ ok: true, hits: 1, kills: 1, gold: 250 });
    expect(s.events).toEqual([
      { kind: 'special', type: 'keg', x: 100, y: 240, radius: 70, hits: 1 },
      { kind: 'kill', enemyId: 0, enemyType: 'boss', bounty: 150, cause: 'special' },
      { kind: 'bossDown', enemyId: 0, cause: 'special' },
    ]);
    expect(phaseOf(s)).toBe('wave');
    tick(s);
    expect(s.events).toEqual([{ kind: 'waveClear', wave: 10, bonus: 25 }, { kind: 'won' }]);
    expect(phaseOf(s)).toBe('won');
    expect(s.gold).toBe(275);
  });

  it('a boss at 80.5 hp survives with 0.5', () => {
    const s = inWave(10, [enemy(0, 'boss', { hp: 80.5 })]);
    expect(useSpecial(s, 'keg', { x: 100, y: 240 })).toMatchObject({ kills: 0 });
    expect(s.enemies[0].hp).toBe(0.5);
  });
});

describe('(c) Tar Barrel', () => {
  it('a Goblin walks 120 px in the 240 slowed ticks (240 unslowed), then full speed', () => {
    // 240 ticks * 60 px/s * (1 - 0.5) / 60 = 120.
    const s = inWave(4, [enemy(0, 'goblin', { distance: 100 }), enemy(1, 'goblin', { distance: 400 })]);
    // 90 px radius: goblin 0 at (100, 240) is inside (100, 150); goblin 1 at (160, 96 + ...) is far.
    expect(useSpecial(s, 'tarBarrel', { x: 100, y: 150 })).toMatchObject({ ok: true, hits: 1 });
    run(s, 240);
    expect(s.enemies[0].distance).toBeCloseTo(220, 9);
    expect(s.enemies[1].distance).toBeCloseTo(640, 9);
    expect([s.enemies[0].slow, s.enemies[0].slowTicksLeft]).toEqual([0, 0]);
    run(s, 60);
    expect(s.enemies[0].distance).toBeCloseTo(280, 9);
  });

  it('the boss gets 0.3: 240 ticks * 25 * 0.7 / 60 = 70 px', () => {
    const s = inWave(10, [enemy(0, 'boss')]);
    useSpecial(s, 'tarBarrel', { x: 100, y: 240 });
    // Milestone 25c: on the special slow channel.
    expect([s.enemies[0].specialSlow, s.enemies[0].specialSlowTicksLeft]).toEqual([0.3, 240]);
    run(s, 240);
    expect(s.enemies[0].distance).toBeCloseTo(170, 9);
  });

  it('a Harpy is slowed (90 * 0.5 * 4 = 180 px in 240 ticks) and a Tar Pit in range still cannot target it', () => {
    const s = inWave(4, [enemy(0, 'harpy')], 'tarpit');
    useSpecial(s, 'tarBarrel', { x: 100, y: 240 });
    expect([s.enemies[0].specialSlow, s.enemies[0].specialSlowTicksLeft]).toEqual([0.5, 240]);
    // Tower centre (112, 176): 65.1 px from the Harpy, inside the 90 px range.
    expect(Math.hypot(112 - 100, 176 - 240)).toBeLessThan(90);
    expect(findTarget(s, s.towers[0])).toBeUndefined();
    run(s, 240);
    expect(s.enemies[0].distance).toBeCloseTo(280, 9);
    expect(s.enemies[0].hp).toBe(40); // the Tar Pit never shot it
  });

  // Milestone 25c (special slow channel): before 25c the barrel did nothing
  // under a stronger tower slow and its 240 ticks were lost when that slow
  // ran out. Now it sits on its own channel and outlasts the tower slow.
  it('under a stronger 0.6 tower slow the barrel still lands on its own channel and takes over when the 0.6 runs out', () => {
    const s = inWave(4, [enemy(0, 'troll', { slow: 0.6, slowTicksLeft: 50 })]);
    expect(useSpecial(s, 'tarBarrel', { x: 100, y: 240 })).toMatchObject({ ok: true, hits: 1 });
    expect([s.enemies[0].slow, s.enemies[0].slowTicksLeft]).toEqual([0.6, 50]);
    expect([s.enemies[0].specialSlow, s.enemies[0].specialSlowTicksLeft]).toEqual([0.5, 240]);
    expect(s.events.map((e) => e.kind)).toEqual(['special', 'slowed']);
    expect(s.specialCharges).toBe(0);
    // 50 ticks at 0.6 (35 * 0.4 / 60 each), then 190 at 0.5, then free.
    const start = s.enemies[0].distance;
    run(s, 50);
    expect(s.enemies[0].distance - start).toBeCloseTo((50 * 35 * 0.4) / 60, 9);
    expect([s.enemies[0].slow, s.enemies[0].slowTicksLeft]).toEqual([0, 0]);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(190);
    run(s, 190);
    expect(s.enemies[0].distance - start).toBeCloseTo((50 * 35 * 0.4 + 190 * 35 * 0.5) / 60, 9);
    expect([s.enemies[0].specialSlow, s.enemies[0].specialSlowTicksLeft]).toEqual([0, 0]);
  });

  it('a tower slow (equal or weaker) leaves the special slow untouched; both channels keep their own timers', () => {
    const s = inWave(4, [enemy(0, 'troll', { slow: 0.5, slowTicksLeft: 7 }), enemy(1, 'troll', { slow: 0.4, slowTicksLeft: 7 })]);
    useSpecial(s, 'tarBarrel', { x: 100, y: 240 });
    expect(s.enemies.map((e) => [e.slow, e.slowTicksLeft, e.specialSlow, e.specialSlowTicksLeft])).toEqual([
      [0.5, 7, 0.5, 240],
      [0.4, 7, 0.5, 240],
    ]);
  });
});

describe('(d) Fire Arrows', () => {
  const burnTotal = (s: GameState, n: number, id = 0) => {
    let total = 0;
    for (let i = 0; i < n; i++) {
      tick(s);
      for (const e of s.events) if (e.kind === 'burn' && e.enemyId === id) total += e.damage;
    }
    return total;
  };

  // Milestone 25c: Fire Arrows burn 30/s (10 before).
  it('untarred Troll: 240 ticks * 30 / 60 = 120 in all, then the burn is over', () => {
    const s = inWave(7, [enemy(0, 'troll')]);
    useSpecial(s, 'fireArrows', { x: 100, y: 160 }); // 80 px away, inclusive
    expect(burnTotal(s, 300)).toBeCloseTo(120, 9);
    expect(s.enemies[0].hp).toBeCloseTo(580, 9);
    expect([s.enemies[0].burnDps, s.enemies[0].burnTicksLeft]).toEqual([0, 0]);
  });

  it('Troll kept tarred by an upgraded Tar Pit: 240 * 60 / 60 = 240', () => {
    const s = inWave(7, [enemy(0, 'troll', { distance: 60 })], 'tarpit', true);
    tick(s); // the Tar Pit fires on the first tick and keeps refreshing every 30
    expect(s.enemies[0].slow).toBe(0.6);
    useSpecial(s, 'fireArrows', { x: 100, y: 240 });
    let alwaysSlowed = true;
    let total = 0;
    for (let i = 0; i < 240; i++) {
      alwaysSlowed &&= s.enemies[0].slowTicksLeft > 1; // still slowed after this tick's move step
      tick(s);
      for (const e of s.events) if (e.kind === 'burn') total += e.damage;
    }
    expect(alwaysSlowed).toBe(true);
    expect(total).toBeCloseTo(240, 9);
    expect(s.enemies[0].burnTicksLeft).toBe(0);
  });

  it('sticks to a Harpy, while a Fire Pot shot on the same Harpy leaves no burn', () => {
    const s = inWave(7, [enemy(0, 'harpy', { hp: 1000 })], 'firepot', true);
    tick(s);
    expect(s.events.some((e) => e.kind === 'hit' && e.tower === 'firepot' && e.enemyId === 0)).toBe(true);
    expect([s.enemies[0].burnDps, s.enemies[0].burnTicksLeft]).toEqual([0, 0]);
    const p = enemyPosition(s.enemies[0]);
    useSpecial(s, 'fireArrows', p);
    expect([s.enemies[0].burnDps, s.enemies[0].burnTicksLeft]).toEqual([30, 240]);
    expect(burnTotal(s, 60)).toBeCloseTo(30, 9);
    expect([s.enemies[0].burnDps, s.enemies[0].burnTicksLeft]).toEqual([30, 180]);
  });

  it('an 8 dps burn is replaced by 30 for 240; a 40 hp Harpy dies of it on tick 80 (40 / 0.5), paying its bounty', () => {
    const s = inWave(7, [enemy(0, 'troll', { burnDps: 8, burnTicksLeft: 200 }), enemy(1, 'harpy', { distance: 20 })]);
    useSpecial(s, 'fireArrows', { x: 60, y: 240 });
    expect([s.enemies[0].burnDps, s.enemies[0].burnTicksLeft]).toEqual([30, 240]);
    run(s, 79);
    expect(s.enemies.map((e) => e.id)).toEqual([0, 1]);
    tick(s);
    expect(s.enemies.map((e) => e.id)).toEqual([0]);
    expect(s.events).toContainEqual({ kind: 'kill', enemyId: 1, enemyType: 'harpy', bounty: ENEMY_STATS.harpy.bounty, cause: 'burn' });
  });
});

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
    expect(s.events).toEqual([{ kind: 'special', type: 'keg', x: 800, y: 400, radius: 70, hits: 0 }]);
    expect(s.specialCharges).toBe(0);
    expect(useSpecial(s, 'keg', { x: 100, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
  });
});

/** Replay a comboWithKegs script tick by tick, collecting every event once. */
function replay(): { state: GameState; events: GameEvent[] } {
  const script = comboWithKegs();
  const s = createGame();
  const events: GameEvent[] = [];
  for (let i = 0; i < WAVES.length && phaseOf(s) === 'setup'; i++) {
    for (const a of script[i] ?? []) applyAction(s, a);
    startWave(s);
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

describe('(j) (l) a full comboWithKegs game', () => {
  it('kills + exits == spawns, each id gone at most once; the replay equals playScripted', () => {
    const { state, events } = replay();
    const reference = playScripted(comboWithKegs());
    expect(state).toEqual(reference.state);
    const ids = (kind: string) => events.filter((e) => e.kind === kind).map((e) => (e as { enemyId: number }).enemyId);
    const spawns = ids('spawn');
    const gone = [...ids('kill'), ...ids('exit')];
    expect(new Set(gone).size).toBe(gone.length);
    expect(gone.length).toBe(spawns.length);
    expect(spawns.length).toBe(WAVES.reduce((n, w) => n + w.groups.reduce((m, g) => m + g.count, 0), 0));
    // Gold: start 100 + bounties + 10 clears - net spend equals the final gold is covered by the pins; here
    // just the special bookkeeping: every special kill follows a special event.
    const specials = events.filter((e) => e.kind === 'special');
    expect(specials).toHaveLength(10);
    const specialKills = events.filter((e) => e.kind === 'kill' && e.cause === 'special');
    expect(specialKills.length).toBeLessThanOrEqual(specials.reduce((n, e) => n + (e.kind === 'special' ? e.hits : 0), 0));
    // The DEVLOG's "the fixed policy mostly misses": on the milestone 25c
    // second-pass waves no keg hits anything (25b: one keg, a Harpy and a
    // Wolf). The archetypes use the cluster policy instead.
    expect(specials.map((e) => (e.kind === 'special' ? e.hits : -1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(specialKills).toEqual([]);
    expect([state.phase, state.wave, state.lives, state.gold]).toEqual(['won', 10, 12, 468]);
  });

  it('two runs are identical (state, waves, log)', () => {
    const a = playScripted(comboWithKegs());
    const b = playScripted(comboWithKegs());
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });
});

describe('(k) after the game ends', () => {
  it('no special after won or lost, even with a charge left', () => {
    const won = inWave(10, [enemy(0, 'boss', { hp: 1 })]);
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
