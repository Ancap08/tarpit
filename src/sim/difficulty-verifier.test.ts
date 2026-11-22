// Verifier (milestone 25): independent probes of the difficulty levels
// (docs/SCOPE-v4.md "Difficulty"), with setups chosen apart from
// difficulty.test.ts. Exact values; the arithmetic is in each comment.
//
// Geometry (as boss-verifier.test.ts): cell B = (2,5), centre (80,176).
// Path distance 80 is (80,240), 64 px below B: inside the Musketeer's 110
// and the Longbow's 150.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import type { Cell } from './grid';
import { comboBuild, lazyBuild, playScripted } from './headless';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

const B: Cell = { col: 2, row: 5 };
const LEVELS = ['easy', 'normal', 'hard'] as const;

// (a) By hand, base x multiplier, then Math.round (half rounds up, toward
// +infinity). Milestone 25c second pass numbers (base hp 19 / 20 / 900 /
// 36 / 160 / 4000; Easy 0.75, Hard 1.2); no half case is left:
//   Goblin        19 x 0.75 = 14.25 -> 14   19 x 1.2 = 22.8 -> 23
//   Wolf          20 x 0.75 = 15            20 x 1.2 = 24
//   Troll        900 x 0.75 = 675          900 x 1.2 = 1080
//   Harpy         36 x 0.75 = 27            36 x 1.2 = 43.2 -> 43
//   Shieldbearer 160 x 0.75 = 120          160 x 1.2 = 192
//   Boss        4000 x 0.75 = 3000        4000 x 1.2 = 4800
const HAND: Record<EnemyType, readonly [number, number, number]> = {
  goblin: [14, 19, 23],
  wolf: [15, 20, 24],
  troll: [675, 900, 1080],
  harpy: [27, 36, 43],
  shieldbearer: [120, 160, 192],
  boss: [3000, 4000, 4800],
};

function enemy(id: number, type: EnemyType, distance: number, hp: number): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

/** Mid-wave-1 state on a level, nothing left to spawn, the given towers built for free. */
function arena(difficulty: Difficulty, enemies: Enemy[], towers: [Cell, TowerType, boolean?][] = []): GameState {
  const s = createGame({ difficulty });
  s.gold = 1000;
  for (const [cell, type, upgraded] of towers) {
    expect(buildTower(s, cell, type).ok).toBe(true);
    if (upgraded) expect(upgradeTower(s, cell).ok).toBe(true);
  }
  s.gold = 0;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = WAVES[0].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 50;
  s.events = [];
  return s;
}

/** Every enemy the 10 waves spawn on a level, read on its spawn tick; lives kept high so no loss. */
function spawned(difficulty: Difficulty): { type: EnemyType; hp: number; distance: number }[] {
  const s = createGame({ difficulty });
  s.lives = 1e9;
  const out: { type: EnemyType; hp: number; distance: number }[] = [];
  for (let w = 0; w < WAVES.length; w++) {
    startWave(s);
    while (s.phase === 'wave') {
      tick(s);
      for (const e of s.events) {
        if (e.kind !== 'spawn') continue;
        const en = s.enemies.find((x) => x.id === e.enemyId)!;
        out.push({ type: en.type, hp: en.hp, distance: en.distance });
      }
    }
  }
  return out;
}

describe('(a) scaled hp, by hand, against spawned enemies', () => {
  it('Math.round on the fractional cases: 19 x 0.75 = 14.25 -> 14, 19 x 1.2 = 22.8 -> 23, 36 x 1.2 = 43.2 -> 43 (milestone 25c second pass; no half case left)', () => {
    expect(enemyMaxHp('goblin', 'easy')).toBe(14);
    expect(enemyMaxHp('goblin', 'hard')).toBe(23);
    expect(enemyMaxHp('harpy', 'hard')).toBe(43);
    expect(Math.round(16.5)).toBe(17); // half still rounds up
  });

  LEVELS.forEach((level, i) => {
    it(`${level}: all six types spawn with the hand-computed hp, at distance 0`, () => {
      const all = spawned(level);
      // 10 waves: every type appears, and the boss exactly once.
      expect(new Set(all.map((e) => e.type))).toEqual(new Set(Object.keys(HAND)));
      expect(all.filter((e) => e.type === 'boss')).toHaveLength(1);
      for (const e of all) {
        expect(e.hp, `${level} ${e.type}`).toBe(HAND[e.type][i]);
        expect(e.distance).toBe(0);
      }
      // (e) The renderer's "hurt" test is hp < enemyMaxHp(type, level): a fresh enemy is not hurt.
      for (const e of all) expect(e.hp < enemyMaxHp(e.type, level)).toBe(false);
      // The same count spawns on every level (waves do not change).
      expect(all.length).toBe(spawned('normal').length);
    });
  });
});

describe('(b) bounty, speed, livesCost and slowCap do not depend on the level', () => {
  it('ENEMY_STATS is one table with no level in it (the Normal numbers)', () => {
    expect(ENEMY_STATS).toEqual({
      goblin: { hp: 19, speed: 60, bounty: 2, flying: false, shield: false, livesCost: 1 },
      wolf: { hp: 20, speed: 120, bounty: 2, flying: false, shield: false, livesCost: 1 },
      troll: { hp: 900, speed: 35, bounty: 8, flying: false, shield: false, livesCost: 1 },
      harpy: { hp: 36, speed: 90, bounty: 3, flying: true, shield: false, livesCost: 1 },
      shieldbearer: { hp: 160, speed: 45, bounty: 5, flying: false, shield: true, livesCost: 1 },
      boss: { hp: 4000, speed: 25, bounty: 150, flying: false, shield: false, livesCost: 5, slowCap: 0.3 },
    });
  });

  // One enemy of each type at 1 hp, 64 px from a Musketeer, which kills it
  // on tick 1. A far-off Goblin with 1e6 hp keeps the wave open, so the
  // gold is the bounty alone (no 25 clear bonus).
  for (const level of LEVELS) {
    it(`${level}: a kill pays the base bounty for every type`, () => {
      for (const type of Object.keys(HAND) as EnemyType[]) {
        // Musketeer (12 damage, full on a shield since 12 > 10) kills a 1 hp enemy on tick 1.
        const s = arena(level, [enemy(1, type, 80, 1), enemy(2, 'goblin', 500, 1e6)], [[B, 'musketeer']]);
        tick(s);
        expect(s.gold, `${level} ${type}`).toBe([2, 2, 8, 3, 5, 150][Object.keys(HAND).indexOf(type)]);
      }
    });

    it(`${level}: speed (one tick = speed / 60 px), the boss slow cap 0.3, and exit cost`, () => {
      for (const [type, speed] of [['goblin', 60], ['wolf', 120], ['troll', 35], ['harpy', 90], ['shieldbearer', 45], ['boss', 25]] as const) {
        const s = arena(level, [enemy(1, type, 80, 1e6)]);
        tick(s);
        expect(s.enemies[0].distance, `${level} ${type}`).toBeCloseTo(80 + speed / 60, 9);
      }
      // Upgraded Tar Pit: slow 0.6, capped to 0.3 on the boss, full on a Troll.
      for (const [type, slow] of [['boss', 0.3], ['troll', 0.6]] as const) {
        const s = arena(level, [enemy(1, type, 80, 1e6)], [[B, 'tarpit', true]]);
        tick(s);
        const ev = s.events.filter((e): e is Extract<GameEvent, { kind: 'slowed' }> => e.kind === 'slowed');
        expect(ev.map((e) => e.slow)).toEqual([slow]);
      }
      // Exits: a Goblin costs 1, the boss 5. Start from 100 lives on every level.
      for (const [type, cost] of [['goblin', 1], ['boss', 5]] as const) {
        const s = arena(level, [enemy(1, type, 1e9, 1e6), enemy(2, 'goblin', 10, 1e6)]);
        s.lives = 100;
        tick(s);
        expect(s.lives).toBe(100 - cost);
      }
    });
  }
});

describe('(c) tower damage does not depend on the level', () => {
  // A Musketeer shot is 12 on every level: Easy 23 - 12 = 11, Normal
  // 30 - 12 = 18, Hard 39 - 12 = 27.
  for (const [level, full, left] of [['easy', 23, 11], ['normal', 30, 18], ['hard', 39, 27]] as const) {
    it(`${level}: a Musketeer shot takes a Goblin from ${full} to ${left}`, () => {
      const s = arena(level, [enemy(1, 'goblin', 80, full)], [[B, 'musketeer']]);
      tick(s);
      expect(s.enemies[0].hp).toBe(left);
      const hits = s.events.filter((e): e is Extract<GameEvent, { kind: 'hit' }> => e.kind === 'hit');
      expect(hits.map((h) => h.damage)).toEqual([12]);
    });
  }
});

describe('(d) the shield keys on the shot base damage, not on scaled hp', () => {
  // Musketeer 12 > 10: full. Longbow 4 <= 10: half, 2. Upgraded Longbow
  // 9 <= 10: half, 4.5. Upgraded Musketeer 22: full. The same on every
  // level: Easy 90 -> 78 / 88 / 85.5 / 68; Hard 156 -> 144 / 154 / 151.5 / 134.
  const shots: [TowerType, boolean, number][] = [
    ['musketeer', false, 12],
    ['longbow', false, 2],
    ['longbow', true, 4.5],
    ['musketeer', true, 22],
  ];
  for (const [level, full] of [['easy', 90], ['normal', 120], ['hard', 156]] as const) {
    it(`${level}: Shieldbearer ${full} hp takes 12, 2, 4.5 and 22`, () => {
      for (const [tower, upgraded, dealt] of shots) {
        const s = arena(level, [enemy(1, 'shieldbearer', 80, full)], [[B, tower, upgraded]]);
        tick(s);
        expect(s.enemies[0].hp, `${tower} ${upgraded}`).toBe(full - dealt);
      }
    });
  }
});

describe('(f) createGame() is Normal', () => {
  it('no options, {} and { difficulty: "normal" } are deeply equal: 100 gold, 20 lives', () => {
    const a = createGame();
    expect(a).toEqual(createGame({ difficulty: 'normal' }));
    expect(a).toEqual(createGame({}));
    expect(a).toEqual(createGame({ difficulty: undefined }));
    expect({ d: a.difficulty, gold: a.gold, lives: a.lives }).toEqual({ d: 'normal', gold: 100, lives: 20 });
    // And after 600 ticks of wave 1 they are still equal.
    const b = createGame({ difficulty: 'normal' });
    startWave(a);
    startWave(b);
    for (let i = 0; i < 600; i++) {
      tick(a);
      tick(b);
    }
    expect(a).toEqual(b);
  });
});

describe('(g) determinism per level', () => {
  for (const level of LEVELS) {
    it(`${level}: two full comboBuild runs are identical (script, state, wave reports)`, () => {
      const s1 = comboBuild(level);
      const s2 = comboBuild(level);
      expect(s2).toEqual(s1);
      const a = playScripted(s1, undefined, level);
      const b = playScripted(s2, undefined, level);
      expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
      expect(b.waves).toEqual(a.waves);
    });
  }
});

describe('(h) the SCOPE-v4 Easy and Hard targets (met in milestone 25c, second pass)', () => {
  it('lazyBuild on Easy wins with 6 lives and 940 gold', () => {
    const r = playScripted(lazyBuild('easy'), undefined, 'easy');
    expect(r.waves.map((w) => w.lives)).toEqual([30, 30, 30, 30, 27, 27, 26, 23, 14, 6]);
    expect({ phase: r.state.phase, wave: r.state.wave, lives: r.state.lives, gold: r.state.gold }).toEqual({ phase: 'won', wave: 10, lives: 6, gold: 940 });
  });

  // comboBuild on Hard loses on wave 8 (the target allows a loss from wave 8
  // on); Normal: won, 13 lives, 476 gold, 175 after wave 9.
  it('comboBuild on Hard loses on wave 8 (Normal: won with 13 lives, 476 gold, 175 after wave 9)', () => {
    const hard = playScripted(comboBuild('hard'), undefined, 'hard');
    expect(hard.waves.map((w) => w.lives)).toEqual([15, 15, 14, 13, 11, 11, 1, 0]);
    expect({ phase: hard.state.phase, wave: hard.state.wave, gold: hard.state.gold }).toEqual({ phase: 'lost', wave: 8, gold: 284 });
    const normal = playScripted(comboBuild());
    expect({ phase: normal.state.phase, lives: normal.state.lives, gold: normal.state.gold }).toEqual({ phase: 'won', lives: 13, gold: 476 });
    expect(normal.waves[8].gold).toBe(175);
  });
});
