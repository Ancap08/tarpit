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
// +infinity; the only half case is the Easy Goblin):
//   Goblin        30 x 0.75 = 22.5 -> 23    30 x 1.3 = 39
//   Wolf          28 x 0.75 = 21            28 x 1.3 = 36.4 -> 36
//   Troll        700 x 0.75 = 525          700 x 1.3 = 910
//   Harpy         40 x 0.75 = 30            40 x 1.3 = 52
//   Shieldbearer 120 x 0.75 = 90           120 x 1.3 = 156
//   Boss        4000 x 0.75 = 3000        4000 x 1.3 = 5200
// (700 x 1.3 is 910.0000000000001 in floating point; round gives 910.)
const HAND: Record<EnemyType, readonly [number, number, number]> = {
  goblin: [23, 30, 39],
  wolf: [21, 28, 36],
  troll: [525, 700, 910],
  harpy: [30, 40, 52],
  shieldbearer: [90, 120, 156],
  boss: [3000, 4000, 5200],
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
  it('Math.round takes the one half case up: 30 x 0.75 = 22.5 -> 23', () => {
    expect(30 * 0.75).toBe(22.5);
    expect(enemyMaxHp('goblin', 'easy')).toBe(23);
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
      goblin: { hp: 30, speed: 60, bounty: 4, flying: false, shield: false, livesCost: 1 },
      wolf: { hp: 28, speed: 120, bounty: 5, flying: false, shield: false, livesCost: 1 },
      troll: { hp: 700, speed: 35, bounty: 8, flying: false, shield: false, livesCost: 1 },
      harpy: { hp: 40, speed: 90, bounty: 7, flying: true, shield: false, livesCost: 1 },
      shieldbearer: { hp: 120, speed: 45, bounty: 9, flying: false, shield: true, livesCost: 1 },
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
        expect(s.gold, `${level} ${type}`).toBe([4, 5, 8, 7, 9, 150][Object.keys(HAND).indexOf(type)]);
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

describe('(h) the two SCOPE-v4 targets (milestone 28 owns them)', () => {
  // milestone 28 target: lazyBuild wins on Easy. Today it misses. Lives
  // after waves 1 to 9: 25, 25, 25, 25, 23, 23, 17, 17, 14. In wave 10 ten
  // 1-life exits take 14 to 4, then Grumblefoot's exit costs 5: 4 - 5 = -1.
  it('lazyBuild on Easy loses on wave 10 at -1 lives (the sim does not clamp)', () => {
    const r = playScripted(lazyBuild('easy'), undefined, 'easy');
    expect(r.waves.map((w) => w.lives)).toEqual([25, 25, 25, 25, 23, 23, 17, 17, 14, -1]);
    expect({ phase: r.state.phase, wave: r.state.wave, lives: r.state.lives, gold: r.state.gold }).toEqual({ phase: 'lost', wave: 10, lives: -1, gold: 603 });
  });

  // milestone 28 target: comboBuild on Hard loses at least 5 more lives than
  // on Normal (won, 12 lives). Today it loses the game: lives 15 -> 9 -> 0
  // on wave 3, which is 12 - 0 = 12 lives worse and a loss.
  it('comboBuild on Hard loses on wave 3 (Normal: won with 12 lives, 497 gold, 145 after wave 9)', () => {
    const hard = playScripted(comboBuild('hard'), undefined, 'hard');
    expect(hard.waves.map((w) => w.lives)).toEqual([15, 9, 0]);
    expect({ phase: hard.state.phase, wave: hard.state.wave, gold: hard.state.gold }).toEqual({ phase: 'lost', wave: 3, gold: 68 });
    const normal = playScripted(comboBuild());
    expect({ phase: normal.state.phase, lives: normal.state.lives, gold: normal.state.gold }).toEqual({ phase: 'won', lives: 12, gold: 497 });
    expect(normal.waves[8].gold).toBe(145);
    expect(normal.state.lives - hard.state.lives).toBeGreaterThanOrEqual(5);
  });
});
