// Verifier tests for milestone 41a (independent of the implementer's levelRules and
// campaignProgress tests). Expected numbers are computed by hand from ENEMY_STATS,
// the level record and the 28% growth step in docs/DESIGN.md.
import { describe, expect, it } from 'vitest';
import {
  availableSpecials, botGood, buildTower, callNextWave, continueEndless, createGame, ENEMY_STATS, LEVELS,
  levelStars, mergeProgress, parseProgress, runBot, serializeProgress, SPECIAL_TYPES, startWave, tick,
  TOWER_DEFS, unlockedLevel, upgradeTower, useSpecial, type GameState, type LevelDef, type TowerType,
} from '.';

import { CAMPAIGN_CONTEXTS } from './campaignContexts';
import { checkLevel } from './checkLevel';

const TOWER_TYPES = Object.keys(TOWER_DEFS) as TowerType[];
const levelOf = (id: number): LevelDef => LEVELS.find((l) => l.id === id)!;
const freeCell = (state: GameState) => {
  for (let row = 0; row < 12; row++) for (let col = 0; col < 20; col++) {
    const probe = createGame({ level: state.level });
    if (buildTower(probe, { col, row }, state.level!.allowedTowers[0]).ok) return { col, row };
  }
  throw new Error('no buildable cell');
};

/** Hp of the first spawned enemy of `type` in `wave`. */
function spawnHp(level: LevelDef, wave: number, type: keyof typeof ENEMY_STATS): number {
  const state = createGame({ level });
  state.wave = wave - 1;
  state.lives = 1e6; // leaks must not end the game before a late spawn
  expect(startWave(state)).toEqual({ ok: true, wave });
  for (let i = 0; i < 30000 && !state.enemies.some((e) => e.type === type); i++) tick(state);
  const enemy = state.enemies.find((e) => e.type === type)!;
  const maxHp = enemy.maxHp ?? enemy.hp; // maxHp is stored only when the factor is not exactly 1
  expect(enemy.hp).toBe(maxHp);
  return maxHp;
}

describe('verifier: level economy and hp by hand', () => {
  it.each(LEVELS)('level $id starts with its gold, 20 lives, its map, wave 0, Normal', (level) => {
    const state = createGame({ level, map: 'switchback', difficulty: 'hard' });
    expect(state).toMatchObject({ gold: level.startGold, lives: 20, wave: 0, difficulty: 'normal', phase: 'setup' });
    expect(state.map.id).toBe(level.map);
    expect(state.endless).toBe(false);
  });

  it('applies the scaled base HP and growth step to Pack Trail Goblins and Switchback Wolves', () => {
    expect(spawnHp(levelOf(2), 1, 'goblin')).toBe(37); // 23 × 1.25 × 1.28
    expect(spawnHp(levelOf(2), 6, 'goblin')).toBe(77); // 23 × 1.25 × 2.68
    expect(spawnHp(levelOf(3), 2, 'wolf')).toBe(29); // 20 × 1.14 × 1.28
  });

  it('hp with growth: Last Light (scale 0.925, growth from wave 5, +28% per wave)', () => {
    const last = levelOf(10);
    expect(spawnHp(last, 4, 'troll')).toBe(Math.round(950 * 0.925)); // 879, no growth yet
    expect(spawnHp(last, 5, 'troll')).toBe(1125); // 950 x 0.925 x 1.28 = 1124.8
    expect(spawnHp(last, 6, 'wolf')).toBe(29); // 20 x 0.925 x 1.56 = 28.86
    expect(spawnHp(last, 7, 'shieldbearer')).toBe(119); // 70 x 0.925 x 1.84 = 119.1
    expect(spawnHp(last, 7, 'grumblemaw')).toBe(Math.round(5600 * 0.925 * 1.84)); // 9531
  });

  it('level 9 spawn HP uses scale 0.987 and starts growing on wave 6', () => {
    const assessor = levelOf(9);
    expect(spawnHp(assessor, 5, 'troll')).toBe(938); // 950 x 0.987
    expect(spawnHp(assessor, 6, 'harpy')).toBe(45); // 36 x 0.987 x 1.28
    expect(spawnHp(assessor, 7, 'shieldbearer')).toBe(108); // 70 x 0.987 x 1.56
    expect(spawnHp(assessor, 7, 'boss')).toBe(6159); // 4000 x 0.987 x 1.56
  });

  it('hp without growth stays fixed for every wave of a level with no growth', () => {
    const hold = levelOf(7);
    expect(spawnHp(hold, 1, 'goblin')).toBe(30); // 23 x 1.3 = 29.9
    expect(spawnHp(hold, 7, 'goblin')).toBe(30);
  });
});

describe('verifier: finite waves, win, no endless', () => {
  it.each(LEVELS)('level $id: bot reaches the last wave, wins there, endless is refused', (level) => {
    const run = runBot(createGame({ level }), botGood);
    expect(run.refused).toBe(0);
    expect(run.state.phase).toBe('won');
    expect(run.state.wave).toBe(level.waves.length);
    const before = structuredClone(run.state);
    expect(continueEndless(run.state)).toEqual({ ok: false, reason: 'campaign-level' });
    expect(run.state).toEqual(before);
  });

  it('calling the last wave early is refused', () => {
    const state = createGame({ level: levelOf(1) });
    state.wave = levelOf(1).waves.length - 1;
    startWave(state);
    expect(callNextWave(state)).toEqual({ ok: false, reason: 'last-wave' });
  });
});

describe('verifier: restrictions refuse with a reason and change nothing', () => {
  it.each(LEVELS)('level $id: every disallowed tower type is tower-locked', (level) => {
    for (const type of TOWER_TYPES.filter((t) => !level.allowedTowers.includes(t))) {
      const state = createGame({ level });
      state.gold = 100000;
      const before = structuredClone(state);
      expect(buildTower(state, { col: 5, row: 0 }, type)).toEqual({ ok: false, reason: 'tower-locked' });
      expect(state).toEqual(before);
    }
  });

  it.each(LEVELS)('level $id: upgrading past maxTowerLevel is max-level, nothing changes', (level) => {
    const state = createGame({ level });
    state.gold = 100000;
    const cell = freeCell(state);
    expect(buildTower(state, cell, level.allowedTowers[0]).ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    if (level.maxTowerLevel === 2) {
      const before = structuredClone(state);
      expect(upgradeTower(state, cell, 'A')).toEqual({ ok: false, reason: 'max-level' });
      expect(upgradeTower(state, cell, 'B')).toEqual({ ok: false, reason: 'max-level' });
      expect(state).toEqual(before);
    } else {
      expect(upgradeTower(state, cell, 'A').ok).toBe(true);
    }
  });

  it.each(LEVELS)('level $id: specials are exactly the allowed list from wave 1 and none before', (level) => {
    const state = createGame({ level });
    expect(availableSpecials(state)).toEqual([]);
    startWave(state);
    expect(availableSpecials(state)).toEqual(SPECIAL_TYPES.filter((s) => level.allowedSpecials.includes(s)));
    const point = { x: 200, y: 300 };
    for (const special of SPECIAL_TYPES) {
      const probe = structuredClone(state);
      const before = structuredClone(probe);
      const result = useSpecial(probe, special, point);
      if (level.allowedSpecials.includes(special)) expect(result.ok || result.reason !== 'locked').toBe(true);
      else {
        expect(result).toEqual({ ok: false, reason: 'locked' });
        expect(probe).toEqual(before);
      }
    }
  });
});

describe('verifier: reward waves', () => {
  it.each(LEVELS)('level $id offers a reward only after waves in rewardWaves', (level) => {
    const state = createGame({ level });
    const offered: number[] = [];
    for (let wave = 1; wave <= level.waves.length; wave++) {
      runBot(state, botGood, wave);
      if (state.pendingBoon) offered.push(state.wave);
      if (state.phase !== 'setup') break;
    }
    if (state.phase === 'setup' || state.phase === 'won') expect(offered).toEqual([...level.rewardWaves]);
  });
});

describe('verifier: star boundaries', () => {
  const stars = (lives: number, phase: GameState['phase'] = 'won') =>
    levelStars({ cheated: false, level: LEVELS[0], lives, phase });
  it('11/12 and 17/18 lives, a win at 1 life, a loss, an unfinished game, no level', () => {
    expect([stars(11), stars(12), stars(17), stars(18), stars(20), stars(1)]).toEqual([1, 2, 2, 3, 3, 1]);
    expect(stars(0, 'lost')).toBe(0);
    expect(stars(20, 'lost')).toBe(0);
    expect(stars(20, 'wave')).toBe(0);
    expect(stars(20, 'setup')).toBe(0);
    expect(levelStars({ cheated: false, level: undefined, lives: 20, phase: 'won' })).toBe(0);
  });
});

describe('verifier: progress parsing and storage', () => {
  const good = (stars: Record<string, unknown>) => JSON.stringify({ v: 1, stars });
  it('opens level 1 first, a win opens the next, replay keeps the best, a loss changes nothing', () => {
    let p = parseProgress(null);
    expect([unlockedLevel(p, 1), unlockedLevel(p, 2)]).toEqual([true, false]);
    p = mergeProgress(p, 1, 2);
    expect(unlockedLevel(p, 2)).toBe(true);
    expect(unlockedLevel(p, 3)).toBe(false);
    p = mergeProgress(p, 1, 3);
    expect(p[1]).toBe(3);
    expect(mergeProgress(p, 1, 1)).toBe(p);
    expect(mergeProgress(p, 2, 0)).toEqual({ 1: 3, 2: 0 });
    expect(mergeProgress(p, 2, 4)).toBe(p);
    expect(mergeProgress(p, 2, Number.NaN)).toBe(p);
  });

  it('round-trips and rejects non-canonical, hostile, partial and future records without throwing', () => {
    expect(parseProgress(serializeProgress({ 1: 3, 2: 1 }))).toEqual({ 1: 3, 2: 1 });
    const hostile: (string | null | undefined)[] = [
      '', '{', 'null', '[]', '1', '"x"', 'true', '{"v":1}', '{"v":1,"stars":null}', '{"v":1,"stars":[1,2,3]}',
      '{"v":3,"stars":{"1":3}}', '{"v":"1","stars":{"1":3}}', '{"stars":{"1":3}}', undefined, null,
      good({ __proto__: { 2: 3 } }), '{"v":1,"stars":{"__proto__":{"2":3},"constructor":3,"toString":3}}',
      good({ '0': 3, '-1': 3, '1.5': 3, '01': 3, '1e0': 3, '+1': 3, ' 1': 3, '0x2': 3, 'NaN': 3, 'Infinity': 3 }),
      good({ '99999999999999999999': 3, '9007199254740993': 3, '1e21': 3 }),
      good({ '1': 4, '2': 0, '3': '3', '4': null, '5': [3], '6': {}, '7': 2.5, '8': -1, '9': true }),
      '['.repeat(200000), 'x'.repeat(5_000_000),
    ];
    for (const raw of hostile) {
      const parsed = parseProgress(raw);
      expect(Object.keys(parsed)).toEqual([]);
      for (let id = 2; id <= 12; id++) expect(unlockedLevel(parsed, id)).toBe(false);
    }
    expect(({} as Record<string, unknown>)[2]).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, '2')).toBe(false);
    // partial record: only valid entries are kept
    expect(parseProgress(good({ '1': 3, '2': 9, '3': 2 }))).toEqual({ 1: 3, 3: 2 });
    for (const id of [Number.NaN, Infinity, -1, 0, 1.5, 2 ** 60]) {
      expect(() => unlockedLevel({ 1: 3 }, id)).not.toThrow();
      expect(unlockedLevel({ 1: 3 }, id)).toBe(false);
    }
  });
});

describe('verifier: Free play never consults level data', () => {
  it('a Free play state has no level key and is identical to one created with level undefined', () => {
    for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
      for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const old = createGame({ map, difficulty });
        expect('level' in old).toBe(false);
        expect(createGame({ map, difficulty, level: undefined })).toEqual(old);
      }
    }
  });
});

describe('verifier: gate rejections', () => {
  it('rejects a level whose last wave is a single Goblin', () => {
    const level = levelOf(7);
    const trivial = { ...level, waves: [...level.waves.slice(0, -1), { groups: [{ type: 'goblin' as const, count: 1, interval: 0, delay: 0 }] }] };
    expect(checkLevel(trivial, CAMPAIGN_CONTEXTS[6]).failed).toContain('L5');
  }, 60_000);

  it('rejects the finale with its boss removed', () => {
    const level = levelOf(10);
    const waves = level.waves.map((wave, i) => i === level.waves.length - 1
      ? { groups: wave.groups.filter((g) => g.type !== 'grumblemaw') } : wave);
    expect(checkLevel({ ...level, waves }, CAMPAIGN_CONTEXTS[9]).failed).toContain('L5');
  }, 60_000);
});
