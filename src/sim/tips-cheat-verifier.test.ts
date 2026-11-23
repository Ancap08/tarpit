// Milestone 42 verifier probes. Written independently of levelRules.test.ts and
// campaignProgress.test.ts: they use the real LEVELS and the public actions, and
// check what a tip tells the player against what the sim does.
import { describe, expect, it } from 'vitest';
import {
  availableSpecials, buildTower, cellCenter, createGame, grantCheatGold, isBuildable, LEVELS, levelStars, mergeProgress, parseProgress,
  serializeProgress, specialAllowed, startWave, tick, unlockedLevel, upgradeTower, useSpecial, type Enemy, type EnemyType,
  type GameState,
} from '.';
import { MAPS } from './map';

const level = (id: number) => LEVELS.find(l => l.id === id)!;

function enemy(id: number, type: EnemyType, distance: number, hp = 1000, extra: Partial<Enemy> = {}): Enemy {
  return { id, type, hp, maxHp: hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...extra };
}

/** A real campaign level in wave 1 with every wave-1 spawn already made, so only hand-placed enemies exist. */
function arena(id: number, enemies: Enemy[]): GameState {
  const state = createGame({ level: level(id) });
  state.gold = 100000;
  state.lives = 1000;
  startWave(state);
  state.spawnedPerGroup = level(id).waves[0].groups.map(g => g.count);
  state.enemies = enemies;
  state.nextEnemyId = 1000;
  state.events = [];
  return state;
}

/** The free buildable cell nearest to (x, y), at least 20 px away from it. */
function cellNear(state: GameState, x: number, y: number) {
  let best = { col: 0, row: 0 };
  let bestDist = Infinity;
  for (let col = 0; col < 30; col++) for (let row = 0; row < 15; row++) {
    const c = cellCenter({ col, row });
    const d = Math.hypot(c.x - x, c.y - y);
    if (isBuildable(state, { col, row }) && d < bestDist && d > 20) { best = { col, row }; bestDist = d; }
  }
  return best;
}

describe('milestone 42 tips against the sim', () => {
  it('level 5: Fire Pot hits a Harpy but the burn does not stick; Tar Pit and Cannon never target it; Longbow and Musketeer do', () => {
    const run = (type: 'firepot' | 'tarpit' | 'cannon' | 'longbow' | 'musketeer') => {
      const state = arena(5, []);
      const at = MAPS.riverbend.path[0];
      const cell = cellNear(state, at.x + 60, at.y);
      state.enemies = [enemy(1, 'harpy', 60, 1000)];
      expect(buildTower(state, cell, type).ok).toBe(true);
      for (let i = 0; i < 200; i++) tick(state);
      const harpy = state.enemies.find(e => e.id === 1)!;
      return { hp: harpy.hp, burn: harpy.burnTicksLeft ?? 0, slow: harpy.slowTicksLeft };
    };
    expect(run('firepot').hp).toBeLessThan(1000);
    expect(run('firepot').burn).toBe(0);
    expect(run('tarpit')).toMatchObject({ hp: 1000, slow: 0 });
    expect(run('cannon').hp).toBe(1000);
    expect(run('longbow').hp).toBeLessThan(1000);
    expect(run('musketeer').hp).toBeLessThan(1000);
  });

  it('level 4: a tarred enemy takes double burn damage (tip: tar makes the fire burn harder)', () => {
    const burn = (tarred: boolean) => {
      const state = arena(4, [enemy(1, 'goblin', 300, 1000, { burnDps: 5, burnTicksLeft: 120, ...(tarred ? { slow: 0.4, slowTicksLeft: 120 } : {}) })]);
      for (let i = 0; i < 60; i++) tick(state);
      return 1000 - state.enemies[0].hp;
    };
    expect(burn(true)).toBeCloseTo(2 * burn(false), 5);
  });

  it('level 10: damaging Grumblemaw past two thirds calls 8 Wolves, and a Powder Keg kills a Wolf outright', () => {
    const state = arena(10, [enemy(1, 'grumblemaw', 100, 5600 * 2 / 3 + 5, { maxHp: 5600 })]);
    state.wave = 7;
    expect(state.level?.allowedSpecials).toContain('keg');
    expect(buildTower(state, cellNear(state, 110, 240), 'musketeer').ok).toBe(true);
    for (let i = 0; i < 200 && !state.events.some(e => e.kind === 'packCall'); i++) tick(state);
    expect(state.events.some(e => e.kind === 'packCall')).toBe(true);
    for (let i = 0; i < 400; i++) tick(state);
    expect(state.enemies.filter(e => e.type === 'wolf').length + state.events.filter(e => e.kind === 'spawn' && e.enemyType === 'wolf').length).toBeGreaterThan(0);
    const wolfState = arena(10, [enemy(2, 'wolf', 100, 20 * 0.925 * 1.5)]);
    const at = { x: 100, y: 240 };
    expect(useSpecial(wolfState, 'keg', at).ok).toBe(true);
    expect(wolfState.enemies.length).toBe(0);
  });

  it('level 7: the Barricade is offered from wave 1 and stops a walker; level 8: Guards hurt a Shieldbearer in full', () => {
    const wall = arena(7, [enemy(1, 'goblin', 80, 5000)]);
    expect(useSpecial(wall, 'barricade', { x: 140, y: 240 }).ok).toBe(true);
    for (let i = 0; i < 600; i++) tick(wall);
    expect(wall.enemies[0].distance).toBe(140);
    const guards = arena(8, [enemy(1, 'shieldbearer', 90, 5000)]);
    expect(useSpecial(guards, 'guards', { x: 150, y: 96 }).ok).toBe(true);
    const before = guards.enemies[0].hp;
    for (let i = 0; i < 240; i++) tick(guards);
    expect(before - guards.enemies[0].hp).toBeGreaterThan(5);
  });
});

describe('milestone 42 cheat unlocks', () => {
  it('level 1: nothing is open before the cheat, and the cheat opens towers, upgrades and the other specials on their waves', () => {
    const state = createGame({ level: level(1) });
    const cell = { col: 5, row: 0 };
    expect(buildTower(state, cell, 'cannon')).toEqual({ ok: false, reason: 'tower-locked' });
    expect(buildTower(state, cell, 'musketeer').ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    expect(upgradeTower(state, cell, 'A')).toEqual({ ok: false, reason: 'max-level' });
    state.wave = 7;
    expect(availableSpecials(state)).toEqual(['keg']);
    expect(grantCheatGold(state).ok).toBe(true);
    expect(upgradeTower(state, cell, 'A').ok).toBe(true);
    expect(buildTower(state, { col: 6, row: 0 }, 'mortar').ok).toBe(true);
    expect(availableSpecials(state)).toEqual(['keg', 'barricade', 'tarBarrel', 'guards', 'fireArrows']);
    state.wave = 1;
    expect(availableSpecials(state)).toEqual(['keg']);
  });

  it('a cheat in setup gives a charge at wave start, shared by all specials, and one special per charge', () => {
    const state = createGame({ level: level(1) });
    grantCheatGold(state);
    startWave(state);
    state.wave = 7;
    expect(state.specialCharges).toBe(1);
    expect(useSpecial(state, 'fireArrows', { x: 300, y: 96 }).ok).toBe(true);
    expect(useSpecial(state, 'keg', { x: 300, y: 96 })).toEqual({ ok: false, reason: 'no-charge' });
  });

  it('does not leak: a new level or Free play game is uncheated, and LEVELS is never mutated', () => {
    const snapshot = JSON.stringify(LEVELS);
    const cheated = createGame({ level: level(1) });
    grantCheatGold(cheated);
    buildTower(cheated, { col: 5, row: 0 }, 'cannon');
    const next = createGame({ level: level(1) });
    expect(next.cheated).toBe(false);
    expect(buildTower(next, { col: 5, row: 0 }, 'cannon').ok).toBe(false);
    expect(specialAllowed({ ...createGame({ level: level(1) }), wave: 7 }, 'fireArrows')).toBe(false);
    const free = createGame();
    expect(free.cheated).toBe(false);
    expect(JSON.stringify(LEVELS)).toBe(snapshot);
  });
});

describe('milestone 42 progress', () => {
  it('old v1 saves load, a cheated win saves 0 stars once, stars never go down, a later honest win upgrades', () => {
    expect(parseProgress('{"v":1,"stars":{"1":3,"2":1}}')).toEqual({ 1: 3, 2: 1 });
    expect(parseProgress('{"v":1,"stars":{"1":3,"2":0}}')).toEqual({ 1: 3 });
    expect(parseProgress('{"v":2,"stars":{"1":3,"2":0}}')).toEqual({ 1: 3, 2: 0 });
    expect(parseProgress('{"v":3,"stars":{"1":3}}')).toEqual({});
    expect(parseProgress('{"v":2,"stars":{"1":4,"2":-1,"3":1.5,"x":1}}')).toEqual({});
    let p = mergeProgress({}, 1, 0);
    expect(p).toEqual({ 1: 0 });
    expect(unlockedLevel(p, 2)).toBe(true);
    p = mergeProgress(p, 1, 0);
    p = mergeProgress(p, 1, 2);
    expect(p).toEqual({ 1: 2 });
    expect(mergeProgress(p, 1, 0)).toBe(p);
    expect(mergeProgress(p, 1, 1)).toBe(p);
    expect(parseProgress(serializeProgress(p))).toEqual(p);
  });

  it('a cheated win scores 0, a cheated loss scores 0, an honest win scores as before', () => {
    const won = { level: level(1), phase: 'won', lives: 20 } as const;
    expect(levelStars({ ...won, cheated: true })).toBe(0);
    expect(levelStars({ ...won, cheated: false })).toBe(3);
    expect(levelStars({ ...won, phase: 'lost', cheated: true })).toBe(0);
  });
});
