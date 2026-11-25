import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, useSpecial } from './actions';
import { botBeginner, botGood, botPerson, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { findTarget } from './combat';
import { featherEnemy } from './feathers';
import { repairGate } from './gate';
import { callNextWave, createGame, startWave, tick } from './game';
import { LEVELS } from './levels';
import { pathLength } from './map';
import { createKeep } from './oldKeep';
import { towerStatsAt } from './towers';
import type { Enemy, EnemyType, GameState, MapDef } from './types';

const HIGH = { col: 27, row: 4 };
const LOW = { col: 28, row: 4 };
const LINE: MapDef = {
  id: 'siege-test', width: 960, height: 480,
  path: [{ x: 0, y: 256 }, { x: 960, y: 256 }],
  highSites: [HIGH],
};
const GATE = { maxHp: 480, repairCost: 30, repairHp: 160 };
const WAVE = { groups: [{ type: 'goblin', count: 1, delay: 0, interval: 1 }] } as const;

function arena(gate = GATE, map = LINE) {
  const state = createGame({ map, gate });
  return { ...state, gate: state.gate!, fixedWaves: [WAVE, WAVE, WAVE, WAVE] };
}

function enemy(type: EnemyType, id = 0, distance = 960, hp = 1000): Enemy {
  return { type, id, distance, hp, slow: 0, slowTicksLeft: 0 };
}

function wave(state: GameState, enemies: Enemy[]) {
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup.fill(1);
  state.waveTick = 1;
  state.enemies = enemies;
}

describe('the siege gate', () => {
  it('stops ground at the exact exit but lets Royal Harpies leak', () => {
    const state = arena();
    const ground = enemy('goblin', 0, 959);
    wave(state, [ground]);
    tick(state);
    expect(state.lives, 'ground leak').toBe(20);
    expect(state.enemies).toEqual([ground]);
    expect(ground.distance).toBe(960);
    state.enemies.push(enemy('harpy', 1, 959));
    tick(state);
    expect(state.lives, 'Royal Harpy leak').toBe(19);
    expect(state.enemies).toEqual([ground]);
    expect(state.gate.hp).toBeCloseTo(479.8, 9);
  });

  it.each([
    ['goblin', 6], ['wolf', 8], ['shieldbearer', 12], ['troll', 45],
    ['boss', 300], ['grumblemaw', 400],
  ] as const)('%s contributes exactly %d damage per second', (type, damage) => {
    const state = arena();
    wave(state, [enemy(type)]);
    for (let i = 0; i < 60; i++) tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - damage, 9);
    expect(state.lives).toBe(20);
  });

  it('adds the attacks of a crowd only as each walker reaches contact', () => {
    const state = arena();
    wave(state, [enemy('goblin'), enemy('troll', 1), enemy('wolf', 2, 957)]);
    tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - 51 / 60, 9);
    expect(state.enemies[2].distance).toBe(959);
    tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - (51 + 59) / 60, 9);
    expect(state.enemies.map(e => e.distance)).toEqual([960, 960, 960]);
  });

  it('keeps the normal Barricade and Guards ahead of the gate', () => {
    const state = arena();
    state.fixedWaves = Array.from({ length: 7 }, () => WAVE);
    state.wave = 5;
    const lead = enemy('goblin', 0, 895);
    const rear = enemy('wolf', 1, 799);
    const atGate = enemy('troll', 2);
    wave(state, [lead, rear, atGate]);
    expect(useSpecial(state, 'barricade', { x: 960, y: 256 })).toMatchObject({ ok: false, reason: 'near-exit' });
    expect(useSpecial(state, 'barricade', { x: 896, y: 256 }).ok).toBe(true);
    tick(state);
    expect(lead.distance).toBe(896);
    expect(state.gate.hp).toBeCloseTo(480 - 45 / 60, 9);
    state.specialCharges = 1;
    expect(useSpecial(state, 'guards', { x: 837, y: 256 }).ok).toBe(true);
    tick(state);
    expect(rear.distance).toBe(801);
    expect(rear.hp).toBeCloseTo(1000 - 10 / 60, 9);
    expect(state.gate.hp).toBeCloseTo(480 - 90 / 60, 9);
  });

  it('allows tar, burn and a feather retreat at the gate', () => {
    const state = arena();
    const walker = { ...enemy('goblin'), slow: 0.4, slowTicksLeft: 20, burnDps: 6, burnTicksLeft: 20 };
    wave(state, [walker]);
    tick(state);
    expect(walker.hp).toBeCloseTo(1000 - 12 / 60, 9);
    expect(state.gate.hp).toBeCloseTo(480 - 6 / 60, 9);
    const hp = state.gate.hp;
    expect(featherEnemy(state, walker)).toBe(true);
    tick(state);
    expect(walker.distance).toBe(959);
    expect(walker.hp).toBeCloseTo(1000 - 24 / 60, 9);
    expect(state.gate.hp).toBe(hp);
  });

  it('waits for gate attackers to resolve, including after an early call', () => {
    const state = arena();
    wave(state, [enemy('goblin')]);
    tick(state);
    expect(state.phase).toBe('wave');
    expect(callNextWave(state).ok).toBe(true);
    expect(state.enemies).toHaveLength(1);
    expect(repairGate(state)).toMatchObject({ ok: false, reason: 'not-in-setup' });
    Object.assign(state.enemies[0], { hp: 0.1, burnDps: 60, burnTicksLeft: 1 });
    state.spawnedPerGroup.fill(1);
    tick(state);
    expect(state.phase).toBe('setup');
  });

  it('repairs only in setup with enough gold, buys one full-price step and caps it', () => {
    const state = arena();
    state.gate.hp = 200;
    state.gold = 29;
    const before = JSON.stringify(state);
    expect(repairGate(state)).toEqual({ ok: false, reason: 'not-enough-gold' });
    expect(JSON.stringify(state)).toBe(before);
    state.gold = 60;
    wave(state, []);
    expect(repairGate(state)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect([state.gate.hp, state.gold]).toEqual([200, 60]);
    tick(state);
    state.gold = 60;
    expect(repairGate(state)).toEqual({ ok: true, cost: 30, gold: 30, hp: 360 });
    expect(repairGate(state)).toEqual({ ok: true, cost: 30, gold: 0, hp: 480 });
    expect([state.gate.hp, state.gold]).toEqual([480, 0]);
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-full' });
    state.gate.hp = 0;
    state.gold = 30;
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-fallen' });
    expect([state.gate.hp, state.gold]).toEqual([0, 30]);
  });

  it('starts Last stand on the breaking tick, runs exactly 360 wave ticks at double rate, and starts once', () => {
    const state = arena({ ...GATE, maxHp: 1 });
    state.gold = 200;
    expect(buildTower(state, { col: 27, row: 5 }, 'musketeer').ok).toBe(true);
    expect(buildTower(state, { col: 28, row: 5 }, 'firepot').ok).toBe(true);
    state.towers.forEach(tower => { tower.cooldownTicks = 2; });
    const target = enemy('troll', 1, 865, 100_000);
    wave(state, [enemy('boss'), target]);
    const shots = state.towers.map(() => [] as number[]);
    for (let i = 0; i <= 360; i++) {
      target.distance = 865;
      tick(state);
      for (const shot of state.shots) shots[state.towers.findIndex(t => t.type === shot.tower)].push(i);
      expect(state.gate.lastStandTicksLeft).toBe(Math.max(0, 359 - i));
    }
    expect(state.gate.fallen).toBe(true);
    expect(shots[0]).toEqual(Array.from({ length: 12 }, (_, i) => 30 * i));
    expect(shots[1]).toEqual([0, 38, 75, 113, 150, 188, 225, 263, 300, 338]);
    expect(state.towers.map(tower => tower.cooldownTicks)).toEqual([1, 31]);
    state.gate.hp = 1;
    state.enemies.push(enemy('grumblemaw', 2));
    tick(state);
    expect(state.gate.hp).toBe(0);
    expect(state.gate.lastStandTicksLeft).toBe(0);
  });

  it('keeps the unused Last stand ticks across setup', () => {
    const state = arena({ ...GATE, maxHp: 0.5 });
    wave(state, [enemy('troll'), enemy('wolf', 1)]);
    tick(state);
    tick(state);
    expect(state.phase).toBe('setup');
    expect(state.gate.lastStandTicksLeft).toBe(358);
    tick(state);
    expect(state.gate.lastStandTicksLeft).toBe(358);
    wave(state, []);
    tick(state);
    expect(state.gate.lastStandTicksLeft).toBe(357);
  });

  it('holds walkers through the breaking tick, then charges the same leaks as a level without a gate', () => {
    const enemies = [enemy('goblin'), enemy('boss', 1), enemy('grumblemaw', 2)];
    const state = arena({ ...GATE, maxHp: 1 });
    const control = { ...createGame({ map: LINE }), fixedWaves: [WAVE] };
    wave(state, structuredClone(enemies));
    wave(control, structuredClone(enemies));
    tick(state);
    expect(state.gate.hp).toBe(0);
    expect(state.lives).toBe(20);
    tick(state);
    tick(control);
    expect(state.lives).toBe(4);
    expect(state.lives).toBe(control.lives);
    expect(state.events.filter(e => e.kind === 'exit')).toEqual(control.events.filter(e => e.kind === 'exit'));
  });

  it('adds exactly 10% maximum reach on a marked site and follows a tower move', () => {
    const state = arena();
    expect(buildTower(state, HIGH, 'musketeer').ok).toBe(true);
    const tower = state.towers[0];
    const high = towerStatsAt(state, tower);
    const low = towerStatsAt(state, { ...tower, cell: LOW });
    expect(high).toEqual({ ...low, range: 110 * 1.1 });
    // Both positions are 112 px perpendicular to the road.
    state.enemies = [enemy('goblin', 0, HIGH.col * 32 + 16)];
    expect(findTarget(state, tower)).toBe(state.enemies[0]);
    expect(moveTower(state, HIGH, LOW).ok).toBe(true);
    expect(towerStatsAt(state, state.towers[0]).range).toBe(110);
    state.enemies[0].distance = LOW.col * 32 + 16;
    expect(findTarget(state, state.towers[0])).toBeUndefined();
    expect(createKeep().map.highSites).toEqual([{ col: 15, row: 13 }, { col: 15, row: 4 }, { col: 13, row: 7 }, { col: 22, row: 7 }]);
  });

  it('awards Unbroken at a two-star win with a standing gate', () => {
    const level = { ...LEVELS[0], gate: GATE, feat: { kind: 'unbroken' as const }, waves: [WAVE] };
    const state = createGame({ level });
    const gate = state.gate!;
    expect(gate.distance).toBe(pathLength(state.map));
    expect(levelStars(state)).toBe(0);
    state.lives = 12;
    wave(state, []);
    tick(state);
    expect(state.phase).toBe('won');
    expect(levelStars(state)).toBe(3);
    gate.hp = 0;
    expect(levelStars(state)).toBe(2);
    expect(levelStars({ ...state, gate: undefined })).toBe(2);
    gate.hp = 1;
    expect(levelStars({ ...state, lives: 11 })).toBe(1);
    expect(levelStars({ ...state, phase: 'lost' })).toBe(0);
  });

  it('lets Good and Person repair at their thresholds and reserves, and Beginner skip repairs', () => {
    const plan = (policy: typeof botGood, hp: number, gold: number, duringWave = false) => {
      const state = arena();
      state.gate.hp = hp;
      state.gold = gold;
      if (duringWave) wave(state, [enemy('goblin')]);
      return runBot(state, policy, 1, 1).log.filter(step => step.action === 'repairGate');
    };
    expect(plan(botGood, 288, 100)).toHaveLength(1);
    expect(plan(botGood, 289, 100)).toHaveLength(0);
    expect(plan(botGood, 288, 99)).toHaveLength(0);
    expect(plan(botPerson, 144, 30)).toHaveLength(1);
    expect(plan(botPerson, 145, 100)).toHaveLength(0);
    expect(plan(botPerson, 144, 29)).toHaveLength(0);
    expect(plan(botBeginner, 1, 200)).toHaveLength(0);
    for (const bot of [botGood, botPerson, botBeginner]) expect(plan(bot, 1, 200, true)).toHaveLength(0);
  });

  it('produces identical bytes on two runs containing an actual repair and a later breach', () => {
    const replay = () => {
      const state = arena({ ...GATE, maxHp: 240 });
      state.gold = 150;
      state.gate.hp = 100;
      expect(repairGate(state).ok).toBe(true);
      wave(state, [enemy('boss'), enemy('grumblemaw', 1)]);
      const frames = [];
      for (let i = 0; i < 30; i++) {
        tick(state);
        frames.push(JSON.stringify(state));
      }
      expect(state.gate.fallen).toBe(true);
      return frames.join('\n');
    };
    expect(replay()).toBe(replay());
  });
});
