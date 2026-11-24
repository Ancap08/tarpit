import { describe, expect, it } from 'vitest';
import {
  LEVELS, MAP_IDS, SPECIAL_TYPES, TOWER_DEFS, atTowerCap, buildTower, callNextWave, createGame, findTarget, levelStars,
  mergeProgress, parseProgress, pathLength, pickBoon, sellTower, serializeProgress,
  startWave, tick, towerBuildCost, towerStats, unlockedLevel, upgradeTower, useSpecial,
  type GameState, type LevelDef, type LevelTaxes,
} from '.';

const wave = { groups: [{ type: 'goblin', count: 1, interval: 1, delay: 0 }] } as const;
const base: LevelDef = {
  id: 11, map: 'switchback', startGold: 300, waves: [wave, wave, wave], hpScale: 1, hpGrowthStart: null,
  allowedTowers: ['musketeer', 'mortar'], maxTowerLevel: 3, allowedSpecials: ['keg'], rewardWaves: [],
};
const left = { col: 5, row: 0 };
const right = { col: 6, row: 0 };
const spawn = { x: 0, y: 96 };
const game = (taxes: LevelTaxes, extras?: Partial<LevelDef>) => createGame({ level: { ...base, taxes, ...extras } });

function ticks(state: GameState, count: number) {
  for (let i = 0; i < count; i++) tick(state);
}

function clearWithKeg(state: GameState) {
  tick(state);
  expect(useSpecial(state, 'keg', spawn)).toMatchObject({ ok: true, kills: 1 });
  tick(state);
}

describe('taxes on level rules', () => {
  it('charges the actual rounded Window Tax even after a sale; upgrades and refused builds do not count', () => {
    const s = game({ windowTax: 0.05 });
    expect(buildTower(s, left, 'musketeer')).toMatchObject({ ok: true, gold: 250 });
    expect(buildTower(s, left, 'musketeer').ok).toBe(false);
    expect(upgradeTower(s, left)).toMatchObject({ ok: true, gold: 215 });
    expect(towerBuildCost(s, 'musketeer')).toBe(53);
    expect(buildTower(s, right, 'musketeer')).toMatchObject({ gold: 162 });
    expect(sellTower(s, right)).toEqual({ ok: true, gold: 215, refund: 53 });
    expect(towerBuildCost(s, 'musketeer')).toBe(55);
    s.gold = 54;
    expect(buildTower(s, right, 'musketeer')).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(s.towersBuilt).toBe(2);
  });

  it('pays the Frozen Purse once on each clear, including the last, and pays the early bonus separately', () => {
    const s = game({ frozenPurse: 61, noLoitering: 8 });
    startWave(s);
    tick(s);
    expect(useSpecial(s, 'keg', spawn)).toMatchObject({ ok: true, kills: 1, gold: 300 });
    expect(s.events).toContainEqual({ kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty: 0, cause: 'special' });
    expect(callNextWave(s)).toEqual({ ok: true, wave: 2, bonus: 20, gold: 381 });
    expect(s.events).toContainEqual({ kind: 'waveClear', wave: 1, bonus: 61 });
    clearWithKeg(s);
    expect(s).toMatchObject({ gold: 442, phase: 'setup' });
    expect(s.autoWaveTicks).toBeUndefined();
    startWave(s);
    clearWithKeg(s);
    expect(s).toMatchObject({ gold: 503, phase: 'won' });
    expect(s.autoWaveTicks).toBeUndefined();
  });

  it('multiplies movement by Forced March before applying the stronger slow', () => {
    const s = game({ forcedMarch: 0.25 });
    startWave(s);
    ticks(s, 2);
    expect(s.enemies[0].distance).toBe(1.25);
    Object.assign(s.enemies[0], { slow: 0.5, slowTicksLeft: 2, specialSlow: 0.4, specialSlowTicksLeft: 2 });
    ticks(s, 2);
    expect(s.enemies[0].distance).toBe(2.5);
  });

  it('cuts maximum reach after upgrades and boons, retaining the Mortar dead zone', () => {
    const s = game({ curfew: 0.2 });
    const stats = (upgraded: boolean, path?: 'A' | 'B') =>
      towerStats({ type: 'mortar', upgraded, path }, ['longBarrels'], s.level);
    for (const row of [stats(false), stats(true), stats(true, 'B')]) {
      expect(row.range).toBeCloseTo(228.8, 12);
      expect(row.minRange).toBe(70);
    }
    expect(towerStats({ type: 'musketeer', upgraded: true, path: 'A' }, [], s.level).range).toBe(160);
    expect(buildTower(s, left, 'mortar').ok).toBe(true);
    startWave(s);
    tick(s);
    // Spawn is 193px from this Mortar, beyond 176px but within its untaxed 220px.
    const tower = s.towers[0];
    expect(findTarget(s, tower)).toBeUndefined();
    expect(findTarget({ ...s, level: base }, tower)?.id).toBe(0);
  });

  it('starts at exactly eight seconds of setup, stops for the reward choice, and has no opening or post-win timer', () => {
    const s = game({ noLoitering: 8 }, { waves: [wave, wave, wave], rewardWaves: [1] });
    ticks(s, 481);
    expect(s.wave).toBe(0);
    startWave(s);
    clearWithKeg(s);
    ticks(s, 481);
    expect(s).toMatchObject({ phase: 'setup', autoWaveTicks: 480 });
    pickBoon(s, 'longBarrels');
    ticks(s, 479);
    expect(s).toMatchObject({ phase: 'setup', autoWaveTicks: 1 });
    tick(s);
    expect(s.events).toEqual([{ kind: 'waveStart', wave: 2 }]);
    expect(s).toMatchObject({ phase: 'wave', waveTick: 0 });
    clearWithKeg(s);
    ticks(s, 481);
    expect(s).toMatchObject({ phase: 'setup', wave: 2 });
    expect(s.autoWaveTicks).toBeUndefined();
    expect(startWave(s)).toEqual({ ok: true, wave: 3 });
    expect(s.autoWaveTicks).toBeUndefined();
    clearWithKeg(s);
    ticks(s, 481);
    expect(s).toMatchObject({ phase: 'won', wave: 3 });
    expect(s.autoWaveTicks).toBeUndefined();
  });

  it('Rationing refuses a build at the standing cap, permits upgrades and frees a slot on sale', () => {
    const s = game({ rationing: 1 });
    expect(atTowerCap(s)).toBe(false);
    expect(buildTower(s, left, 'musketeer').ok).toBe(true);
    expect(atTowerCap(s)).toBe(true);
    expect(buildTower(s, right, 'musketeer')).toEqual({ ok: false, reason: 'tower-cap' });
    expect(upgradeTower(s, left)).toMatchObject({ ok: true, gold: 215 });
    expect(upgradeTower(s, left, 'B')).toMatchObject({ ok: true, gold: 130 });
    expect(sellTower(s, left)).toMatchObject({ ok: true, gold: 300 });
    expect(atTowerCap(s)).toBe(false);
    expect(buildTower(s, right, 'musketeer')).toMatchObject({ ok: true, gold: 250 });
    expect(s.towersBuilt).toBe(2);
  });
});

describe('feat stars', () => {
  it('counts escapes even when Stone Walls restores all 20 lives', () => {
    const s = game({}, { feat: { kind: 'noLeaks' }, waves: [wave] });
    startWave(s);
    tick(s);
    s.enemies[0].distance = pathLength(s.map);
    tick(s);
    expect(s).toMatchObject({ phase: 'won', lives: 19, leaks: 1 });
    s.pendingBoon = { wave: 1, options: ['stoneWalls'] };
    pickBoon(s, 'stoneWalls');
    expect(s.lives).toBe(23);
    expect(levelStars(s)).toBe(2);
    const perfect = game({}, { feat: { kind: 'noLeaks' }, waves: [wave] });
    startWave(perfect);
    clearWithKeg(perfect);
    expect(levelStars(perfect)).toBe(3);
  });

  it('counts a successful special even with zero hits; ignores a refused cast', () => {
    const s = game({}, { feat: { kind: 'noSpecials' } });
    expect(useSpecial(s, 'keg', spawn).ok).toBe(false);
    expect(levelStars({ ...s, phase: 'won', lives: 12 })).toBe(3);
    startWave(s);
    expect(useSpecial(s, 'keg', spawn)).toMatchObject({ ok: true, hits: 0 });
    expect(levelStars({ ...s, phase: 'won' })).toBe(2);
  });

  it('counts all constructions before and after sale and requires two stars, a win and a clean run', () => {
    const s = game({}, { feat: { kind: 'maxTowers', limit: 1 } });
    buildTower(s, left, 'musketeer');
    sellTower(s, left);
    const won = { ...s, phase: 'won' as const };
    expect(levelStars({ ...won, lives: 12 })).toBe(3);
    expect(levelStars({ ...won, lives: 11 })).toBe(1);
    expect(levelStars({ ...won, cheated: true })).toBe(0);
    expect(levelStars({ ...won, phase: 'lost' })).toBe(0);
    buildTower(s, left, 'musketeer');
    expect(levelStars({ ...s, phase: 'won' })).toBe(2);
  });

  it('carries old stars across the act boundary, preserves the best and opens twenty stops as a prefix', () => {
    const old = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 3]));
    let progress = parseProgress(JSON.stringify({ v: 1, stars: old }));
    expect(unlockedLevel(progress, 11)).toBe(true);
    progress = mergeProgress(progress, 10, 1);
    progress = mergeProgress(progress, 13, 3);
    expect(unlockedLevel(progress, 14)).toBe(false);
    for (let id = 11; id <= 20; id++) progress = mergeProgress(progress, id, 1);
    expect(unlockedLevel(progress, 20)).toBe(true);
    expect(unlockedLevel(progress, 21)).toBe(false);
    expect(parseProgress(serializeProgress(progress))).toEqual({ ...progress, 10: 3, 13: 3 });
  });
});

describe('second-act level records', () => {
  it('opens the full arsenal on ten fixed-HP stops, then combines the six introductions', () => {
    const act = LEVELS.slice(10);
    expect(act.map(level => level.id)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(new Set(act.map(level => level.map))).toEqual(new Set(MAP_IDS));
    const introductions = act.slice(0, 6).flatMap(level => Object.keys(level.taxes!));
    expect(new Set(introductions).size).toBe(6);
    for (const [index, level] of act.entries()) {
      expect(Object.keys(level.taxes!)).toHaveLength(index < 6 ? 1 : 2);
      expect(level.maxTowerLevel).toBe(3);
      expect(level.hpGrowthStart).toBeNull();
      expect(new Set(level.allowedTowers)).toEqual(new Set(Object.keys(TOWER_DEFS)));
      expect(new Set(level.allowedSpecials)).toEqual(new Set(SPECIAL_TYPES));
    }
    for (const kind of ['noLeaks', 'noSpecials', 'maxTowers']) {
      expect(act.filter(level => level.feat?.kind === kind).length).toBeGreaterThanOrEqual(2);
    }
    const last = act.at(-1)!;
    const groups = last.waves.at(-1)!.groups;
    expect(last.endingBoss).toBe('grumblemaw');
    const king = groups.find(group => group.type === last.endingBoss)!;
    expect(king.count).toBe(1);
    for (const escort of groups.filter(group => group !== king)) {
      expect(king.delay).toBeGreaterThan(escort.delay + (escort.count - 1) * escort.interval);
    }
  });
});
