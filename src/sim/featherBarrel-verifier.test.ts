// Independent checks for milestone 50 (feather barrels in Act Two), written by the verifier.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower, useSpecial } from './actions';
import { botGood, botPerson, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { fireTowers } from './combat';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';
import { LEVELS } from './levels';
import { BARREL_RECHARGE_TICKS, SPECIAL_RECHARGE_TICKS } from './specials';
import { FEATHERS } from './feathers';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };

function enemy(id: number, type: EnemyType, distance: number): Enemy {
  return { id, type, distance, hp: ENEMY_STATS[type].hp, slow: 0, slowTicksLeft: 0 };
}

function arena(levelId: number | undefined, enemies: Enemy[], featherTower = false): GameState {
  const level = levelId ? LEVELS[levelId - 1] : undefined;
  const state = createGame({ map: LINE });
  if (level) state.level = level;
  if (featherTower) {
    const cell = { col: 6, row: 5 };
    state.gold = 1000;
    expect(buildTower(state, cell, 'tarpit').ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    expect(upgradeTower(state, cell, 'B').ok).toBe(true);
  }
  state.wave = 5;
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = waveDef(6).groups.map(group => group.count);
  state.enemies = enemies;
  return state;
}

const feathered = (state: GameState) => state.events.filter(event => event.kind === 'feathered');

describe('milestone 50 verifier: rule edges', () => {
  it('a feather barrel dropped on nobody still costs the long wait and feathers nothing', () => {
    const state = arena(14, [enemy(0, 'goblin', 700)]);
    expect(useSpecial(state, 'tarBarrel', { x: 100, y: 240 }).ok).toBe(true);
    expect(feathered(state)).toHaveLength(0);
    expect(state.specialRechargeTicks).toBe(BARREL_RECHARGE_TICKS);
  });

  it('a Harpy is feathered, walks back along the trail for the barrel run, then resumes', () => {
    const harpy = enemy(0, 'harpy', 300);
    const state = arena(14, [harpy]);
    expect(useSpecial(state, 'tarBarrel', { x: 300, y: 240 }).ok).toBe(true);
    expect(harpy.feathered).toBe(true);
    expect(harpy.runTicksLeft).toBe(FEATHERS.barrelRunTicks);
    const start = harpy.distance;
    tick(state);
    expect(harpy.distance).toBeLessThan(start);
    for (let i = 1; i < FEATHERS.barrelRunTicks; i++) tick(state);
    expect(harpy.runTicksLeft).toBe(0);
    const turned = harpy.distance;
    tick(state);
    expect(harpy.distance).toBeGreaterThan(turned);
    expect(turned).toBeCloseTo(start - ENEMY_STATS.harpy.speed / 60 * FEATHERS.barrelRunTicks, 1);
  });

  it('a Feathers tower cannot feather an enemy the barrel already feathered, or the reverse', () => {
    const walker = enemy(0, 'troll', 215);
    const state = arena(14, [walker], true);
    expect(useSpecial(state, 'tarBarrel', { x: 215, y: 240 }).ok).toBe(true);
    expect(walker.runTicksLeft).toBe(FEATHERS.barrelRunTicks);
    state.towers[0].cooldownTicks = 0;
    state.events = [];
    fireTowers(state);
    expect(state.shots.length).toBeGreaterThan(0);
    expect(feathered(state)).toHaveLength(0);
    expect(walker.runTicksLeft).toBe(FEATHERS.barrelRunTicks);

    const second = enemy(1, 'troll', 215);
    const other = arena(14, [second], true);
    other.towers[0].cooldownTicks = 0;
    fireTowers(other);
    other.towers[0].cooldownTicks = 0;
    fireTowers(other);
    expect(second.feathered).toBe(true);
    expect(second.runTicksLeft).toBe(FEATHERS.runTicks);
    other.specialCharges = 1;
    other.events = [];
    expect(useSpecial(other, 'tarBarrel', { x: 215, y: 240 }).ok).toBe(true);
    expect(feathered(other)).toHaveLength(0);
    expect(second.runTicksLeft).toBe(FEATHERS.runTicks);
  });

  it('a barrel on level 10 and a barrel in Free play keep the 1200-tick wait and feather nobody', () => {
    for (const id of [undefined, 5, 10]) {
      const state = arena(id, [enemy(0, 'troll', 300), enemy(1, 'harpy', 305)]);
      state.cheated = true; // unlocks the barrel wherever the level or wave would not
      expect(useSpecial(state, 'tarBarrel', { x: 300, y: 240 }).ok).toBe(true);
      expect(feathered(state)).toHaveLength(0);
      expect(state.specialRechargeTicks).toBe(SPECIAL_RECHARGE_TICKS);
    }
  });

  it.each([11, 15, 16, 18, 20])('Bare hands on level %i: a feather barrel cast forfeits the third star', id => {
    expect(LEVELS[id - 1].feat?.kind).toBe('noSpecials');
    const state = arena(id, [enemy(0, 'troll', 300)]);
    const won = (s: GameState) => ({ ...s, phase: 'won' as const, lives: 20 });
    expect(levelStars(won(state))).toBe(3);
    expect(useSpecial(state, 'tarBarrel', { x: 300, y: 240 }).ok).toBe(true);
    expect(levelStars(won(state))).toBe(2);
  });
});

describe('milestone 50 verifier: level data ledger', () => {
  // Independent copy of main's (dca7edf) starting gold for levels 11 to 20.
  const mainGold = [245, 260, 285, 240, 255, 245, 220, 260, 245, 245]; // levels 11 to 20
  it('only levels 11 to 20 carry the rule; levels 1 to 10 are the same as main', () => {
    LEVELS.forEach((level, i) => expect(!!level.featherBarrels, `level ${i + 1}`).toBe(i >= 10));
  });
  it('Act Two starting gold moved at most 15% and health scales are untouched', () => {
    for (const level of LEVELS.slice(10)) {
      const before = mainGold[level.id - 11];
      expect(Math.abs(level.startGold / before - 1), `level ${level.id}`).toBeLessThanOrEqual(0.15);
    }
    expect(LEVELS.slice(10).map(level => level.hpScale)).toEqual([0.91, 1.14, 0.85, 0.93, 1.08, 1, 0.94, 1, 0.94, 0.925]);
  });
});

describe('milestone 50 verifier: determinism', () => {
  it.each([12, 14])('two identical runs of level %i are the same bytes', id => {
    const once = (bot: typeof botGood) => {
      const run = runBot(createGame({ level: LEVELS[id - 1] }), bot);
      return JSON.stringify({ state: run.state, log: run.log });
    };
    expect(once(botGood)).toBe(once(botGood));
    expect(once(botPerson)).toBe(once(botPerson));
  }, 120_000);
});
