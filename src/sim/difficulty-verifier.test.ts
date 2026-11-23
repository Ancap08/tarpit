// Verifier (milestone 25): independent probes of the difficulty levels
// (docs/SCOPE-v4.md "Difficulty"), with setups chosen apart from
// difficulty.test.ts. Exact values; the arithmetic is in each comment.
//
// Geometry (as boss-verifier.test.ts): cell B = (2,5), centre (80,176).
// Path distance 80 is (80,240), 64 px below B: inside the Musketeer's 110
// and the Longbow's 150.
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { ACT_TWO_HP_GROWTH, enemyMaxHp, type Difficulty } from './difficulty';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { createGame, startWave, tick } from './game';
import type { Cell } from './grid';
import { applyScriptBoon, comboBuild, playScripted } from './headless';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES, waveDef } from './waves';

const B: Cell = { col: 2, row: 5 };
const LEVELS = ['easy', 'normal', 'hard'] as const;

// (a) Before the campaign factor applies, base HP times difficulty is
// rounded once. The Easy Troll and Shieldbearer are exact half-up cases.
const HAND: Record<EnemyType, readonly [number, number, number]> = {
  goblin: [17, 23, 28],
  wolf: [15, 20, 24],
  troll: [713, 950, 1140],
  harpy: [27, 36, 43],
  shieldbearer: [53, 70, 84],
  boss: [3000, 4000, 4800],
  grumblemaw: [4200, 5600, 6720],
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

/** Every enemy the 20 waves spawn on a level, read on its spawn tick; lives kept high so no loss. */
function spawned(difficulty: Difficulty): { type: EnemyType; hp: number; maxHp?: number; distance: number; wave: number }[] {
  const s = createGame({ difficulty });
  s.lives = 1e9;
  const out: { type: EnemyType; hp: number; maxHp?: number; distance: number; wave: number }[] = [];
  for (let w = 0; w < WAVES.length; w++) {
    applyScriptBoon(s);
    startWave(s);
    while (s.phase === 'wave') {
      tick(s);
      for (const e of s.events) {
        if (e.kind !== 'spawn') continue;
        const en = s.enemies.find((x) => x.id === e.enemyId)!;
        out.push({ type: en.type, hp: en.hp, maxHp: en.maxHp, distance: en.distance, wave: s.wave });
      }
    }
  }
  return out;
}

describe('(a) scaled hp, by hand, against spawned enemies', () => {
  it('Math.round on the fractional cases: 23 x 0.75 = 17.25 -> 17, 23 x 1.2 = 27.6 -> 28, 36 x 1.2 = 43.2 -> 43, 950 x 0.75 = 712.5 -> 713 (milestone 28)', () => {
    expect(enemyMaxHp('goblin', 'easy')).toBe(17);
    expect(enemyMaxHp('goblin', 'hard')).toBe(28);
    expect(enemyMaxHp('troll', 'easy')).toBe(713); // half rounds up
    expect(enemyMaxHp('harpy', 'hard')).toBe(43);
    expect(70 * 0.75).toBe(52.5);
    expect(enemyMaxHp('shieldbearer', 'easy')).toBe(53); // half rounds up
  });

  // Expected HP is calculated from base HP, difficulty and the wave factors by hand.
  // Wave 21 applies the first endless factor to wave 20 HP before rounding.
  it.each([
    ['hard', 10, 'boss', 4800],
    ['hard', 11, 'goblin', 33],
    ['normal', 20, 'grumblemaw', 21280],
    ['normal', 21, 'goblin', 92],
  ] as const)('%s wave %i: a fresh %s has exactly %i HP', (difficulty, wave, type, hp) => {
    const s = createGame({ difficulty });
    s.wave = wave - 1;
    s.endless = wave > 20;
    s.lives = 1000;
    expect(startWave(s)).toMatchObject({ ok: true, wave });
    const group = waveDef(wave).groups.findIndex((g) => g.type === type);
    expect(group).toBeGreaterThanOrEqual(0);
    const firstSpawn = Math.round(waveDef(wave).groups[group].delay * 60);
    for (let i = 0; i <= firstSpawn; i++) tick(s);
    const enemy = s.enemies.find((candidate) => candidate.type === type && candidate.distance === 0);
    expect(enemy?.hp).toBe(hp);
    if (wave >= 11) expect(enemy?.maxHp).toBe(hp);
  });

  LEVELS.forEach((level, i) => {
    it(`${level}: all seven types spawn with the hand-computed hp, at distance 0`, () => {
      const all = spawned(level);
      // Every type appears, and each boss appears once.
      expect(new Set(all.map((e) => e.type))).toEqual(new Set(Object.keys(HAND)));
      expect(all.filter((e) => e.type === 'boss')).toHaveLength(1);
      expect(all.filter((e) => e.type === 'grumblemaw')).toHaveLength(1);
      for (const e of all) {
        const expected = e.wave <= 10 ? HAND[e.type][i]
          : Math.round(ENEMY_STATS[e.type].hp * [0.75, 1, 1.2][i] * (1 + ACT_TWO_HP_GROWTH[level] * (e.wave - 10)));
        expect(e.hp, `${level} wave ${e.wave} ${e.type}`).toBe(expected);
        expect(e.distance).toBe(0);
        expect(e.maxHp ?? HAND[e.type][i]).toBe(expected);
      }
      // With no towers, the boss never calls a pack.
      const scheduled = WAVES.flatMap((wave) => wave.groups).reduce((count, group) => count + group.count, 0);
      expect(all.length).toBe(scheduled);
    });
  });
});

describe('(b) bounty, speed, livesCost and slowCap do not depend on the level', () => {
  it('ENEMY_STATS is one base table with no difficulty or wave in it', () => {
    expect(ENEMY_STATS).toEqual({
      goblin: { blockerDps: 6, hp: 23, speed: 60, bounty: 2, flying: false, shield: false, livesCost: 1 },
      wolf: { blockerDps: 8, hp: 20, speed: 120, bounty: 2, flying: false, shield: false, livesCost: 1 },
      troll: { blockerDps: 45, hp: 950, speed: 35, bounty: 8, flying: false, shield: false, livesCost: 1 },
      harpy: { blockerDps: 0, hp: 36, speed: 90, bounty: 3, flying: true, shield: false, livesCost: 1 },
      shieldbearer: { blockerDps: 12, hp: 70, speed: 45, bounty: 5, flying: false, shield: true, livesCost: 1 },
      boss: { blockerDps: 300, hp: 4000, speed: 25, bounty: 150, flying: false, shield: false, livesCost: 5, slowCap: 0.3 },
      grumblemaw: { blockerDps: 400, hp: 5600, speed: 14, bounty: 75, flying: false, shield: false, livesCost: 10, slowCap: 0.3 },
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
        expect(s.gold, `${level} ${type}`).toBe([2, 2, 8, 3, 5, 150, 75][Object.keys(HAND).indexOf(type)]);
      }
    });

    it(`${level}: speed (one tick = speed / 60 px), the boss slow cap 0.3, and exit cost`, () => {
      for (const [type, speed] of [['goblin', 60], ['wolf', 120], ['troll', 35], ['harpy', 90], ['shieldbearer', 45], ['boss', 25], ['grumblemaw', 14]] as const) {
        const s = arena(level, [enemy(1, type, 80, 1e6)]);
        tick(s);
        expect(s.enemies[0].distance, `${level} ${type}`).toBeCloseTo(80 + speed / 60, 9);
      }
      // Upgraded Tar Pit: slow 0.6, capped to 0.3 on the boss, full on a Troll.
      for (const [type, slow] of [['boss', 0.3], ['grumblemaw', 0.3], ['troll', 0.6]] as const) {
        const s = arena(level, [enemy(1, type, 80, 1e6)], [[B, 'tarpit', true]]);
        tick(s);
        const ev = s.events.filter((e): e is Extract<GameEvent, { kind: 'slowed' }> => e.kind === 'slowed');
        expect(ev.map((e) => e.slow)).toEqual([slow]);
      }
      // Start from 100 lives on every level.
      for (const [type, cost] of [['goblin', 1], ['boss', 5], ['grumblemaw', 10]] as const) {
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
    describe(level, () => {
      let script: ReturnType<typeof comboBuild>;
      let replay: ReturnType<typeof playScripted>;
      beforeAll(() => {
        script = comboBuild(level);
        replay = playScripted(script, undefined, level);
      });

      it('records the same comboBuild script twice', () => {
        expect(comboBuild(level)).toEqual(script);
      });

      it('replays the same state and wave reports twice', () => {
        const again = playScripted(script, undefined, level);
        expect(again.state).toEqual(replay.state);
        expect(again.waves).toEqual(replay.waves);
      });
    });
  }
});

// (h) the SCOPE-v4 Easy and Hard targets with their exact results: folded
// into balance.suite.ts in milestone 28 (E1 to E3, H1 to H4 and the matrix).
