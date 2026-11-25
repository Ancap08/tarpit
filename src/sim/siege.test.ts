import { describe, expect, it } from 'vitest';
import { buildTower, moveTower, upgradeTower, useSpecial } from './actions';
import { botBeginner, botGood, botPerson, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { findTarget } from './combat';
import { ENEMY_STATS } from './enemies';
import { FEATHERS, featherEnemy } from './feathers';
import { repairGate } from './gate';
import { callNextWave, createGame, startWave, tick } from './game';
import { LEVELS } from './levels';
import { pathLength, positionAlongPath } from './map';
import { createKeep } from './oldKeep';
import { payQuartering } from './siege';
import { towerStatsAt } from './towers';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { gameWaveDef } from './waves';

const HIGH = { col: 27, row: 4 };
const LOW = { col: 28, row: 4 };
const LINE: MapDef = {
  id: 'siege-test', width: 960, height: 480,
  path: [{ x: 0, y: 256 }, { x: 960, y: 256 }],
  highSites: [HIGH],
};
const GATE = { maxHp: 480, repairCost: 30, repairHp: 160, yardLength: 360 };
const GATE_LINE = 960 - GATE.yardLength;
const WAVE = { groups: [{ type: 'goblin', count: 1, delay: 0, interval: 1 }] } as const;

function arena(gate = GATE, map = LINE) {
  const state = createGame({ map, gate });
  return { ...state, gate: state.gate!, fixedWaves: [WAVE, WAVE, WAVE, WAVE] };
}

function enemy(type: EnemyType, id = 0, distance = GATE_LINE, hp = 1000): Enemy {
  return { type, id, distance, hp, slow: 0, slowTicksLeft: 0 };
}

function wave(state: GameState, enemies: Enemy[]) {
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = gameWaveDef(state, state.wave).groups.map(group => group.count);
  state.waveTick = 1;
  state.enemies = enemies;
}

describe('the siege gate', () => {
  it('stops ground at the gate while Royal Harpies cross the yard and leak at the exit', () => {
    const state = arena();
    const ground = enemy('goblin', 0, GATE_LINE - 1);
    const flyer = enemy('harpy', 1, GATE_LINE - 1);
    wave(state, [ground, flyer]);
    tick(state);
    expect(state.lives, 'ground leak').toBe(20);
    expect(ground.distance).toBe(GATE_LINE);
    expect(flyer.distance).toBe(GATE_LINE + 0.5);
    for (let i = 0; i < 239; i++) tick(state);
    expect(state.lives).toBe(20);
    tick(state);
    expect(state.lives, 'Royal Harpy leak').toBe(19);
    expect(state.enemies).toEqual([ground]);
    expect(state.gate.hp).toBeCloseTo(455.9, 9);
  });

  it.each([
    ['goblin', 6], ['wolf', 8], ['shieldbearer', 12], ['troll', 45],
  ] as const)('%s contributes exactly %d damage per second', (type, damage) => {
    const state = arena();
    wave(state, [enemy(type)]);
    for (let i = 0; i < 60; i++) tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - damage, 9);
    expect(state.lives).toBe(20);
  });

  it.each([
    ['boss', 300, 96, 865, 5],
    ['grumblemaw', 400, 72, 1543, 10],
  ] as const)('%s alone deals %d/s, breaches, then walks the yard and leaks', (type, damage, breakTick, walkTicks, cost) => {
    const state = arena();
    const boss = enemy(type, 0, GATE_LINE, ENEMY_STATS[type].hp);
    wave(state, [boss]);
    for (let i = 0; i < 60; i++) tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - damage, 9);
    expect(boss.distance).toBe(GATE_LINE);
    for (let i = 60; i < breakTick - 1; i++) tick(state);
    expect(state.gate.hp).toBeCloseTo(damage / 60, 9);
    tick(state);
    expect(state.gate).toMatchObject({ hp: 0, fallen: true, lastStandTicksLeft: 359 });
    expect(boss.distance).toBe(GATE_LINE);
    for (let i = 0; i < walkTicks - 1; i++) tick(state);
    expect(state.enemies).toEqual([boss]);
    expect(boss.distance).toBeGreaterThan(GATE_LINE);
    expect(state.lives).toBe(20);
    tick(state);
    expect(state.lives).toBe(20 - cost);
    expect(state.events.slice(0, 2)).toEqual([
      { kind: 'exit', enemyId: boss.id },
      { kind: 'bossDown', enemyId: boss.id, enemyType: type, cause: 'exit' },
    ]);
  });

  it('adds the attacks of a crowd only as each walker reaches contact', () => {
    const state = arena();
    wave(state, [enemy('goblin'), enemy('troll', 1), enemy('wolf', 2, GATE_LINE - 3)]);
    tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - 51 / 60, 9);
    expect(state.enemies[2].distance).toBe(GATE_LINE - 1);
    tick(state);
    expect(state.gate.hp).toBeCloseTo(480 - (51 + 59) / 60, 9);
    expect(state.enemies.map(e => e.distance)).toEqual([GATE_LINE, GATE_LINE, GATE_LINE]);
  });

  it('keeps the normal Barricade and Guards ahead of the gate', () => {
    const state = arena();
    state.fixedWaves = Array.from({ length: 7 }, () => WAVE);
    state.wave = 5;
    const lead = enemy('goblin', 0, 535);
    const rear = enemy('wolf', 1, 439);
    const atGate = enemy('troll', 2);
    wave(state, [lead, rear, atGate]);
    expect(useSpecial(state, 'barricade', { x: 960, y: 256 })).toMatchObject({ ok: false, reason: 'near-exit' });
    expect(useSpecial(state, 'barricade', { x: 536, y: 256 }).ok).toBe(true);
    tick(state);
    expect(lead.distance).toBe(536);
    expect(state.gate.hp).toBeCloseTo(480 - 45 / 60, 9);
    state.specialCharges = 1;
    expect(useSpecial(state, 'guards', { x: 477, y: 256 }).ok).toBe(true);
    tick(state);
    expect(rear.distance).toBe(441);
    expect(rear.hp).toBeCloseTo(1000 - 10 / 60, 9);
    expect(state.gate.hp).toBeCloseTo(480 - 90 / 60, 9);
  });

  it('allows tar, burn and a feather retreat at the gate', () => {
    const state = arena();
    const walker = enemy('goblin', 0, GATE_LINE - 1.25);
    state.wave = 6;
    state.fixedWaves = Array.from({ length: 7 }, () => WAVE);
    wave(state, [walker]);
    expect(useSpecial(state, 'tarBarrel', state.gate).ok).toBe(true);
    tick(state);
    expect(walker.distance).toBe(GATE_LINE - 0.75);
    expect(state.gate.hp).toBe(480);
    state.specialCharges = 1;
    expect(useSpecial(state, 'fireArrows', state.gate).ok).toBe(true);
    tick(state);
    expect(state.gate.hp).toBe(480);
    tick(state);
    expect(walker.hp).toBeCloseTo(1000 - 2 * 52 / 60, 9);
    expect(state.gate.hp).toBeCloseTo(480 - 6 / 60, 9);
    const hp = state.gate.hp;
    expect(featherEnemy(state, walker)).toBe(true);
    tick(state);
    expect(walker.distance).toBe(GATE_LINE - 1);
    expect(walker.hp).toBeCloseTo(1000 - 3 * 52 / 60, 9);
    expect(state.gate.hp).toBe(hp);
  });

  it('feathers a held crowd with a barrel on a level with feather barrels', () => {
    const level = { ...LEVELS[10], gate: GATE, waves: Array.from({ length: 5 }, () => WAVE) };
    const state = createGame({ level });
    const gate = state.gate!;
    state.wave = 4;
    const crowd = Array.from({ length: 6 }, (_, id) => enemy('goblin', id, gate.distance));
    wave(state, crowd);
    tick(state);
    const attackedHp = gate.hp;
    expect(attackedHp).toBeCloseTo(480 - 36 / 60, 9);
    expect(useSpecial(state, 'tarBarrel', gate).ok).toBe(true);
    expect(state.events.filter(e => e.kind === 'feathered')).toHaveLength(6);
    for (let i = 0; i < FEATHERS.barrelRunTicks; i++) tick(state);
    expect(crowd.map(e => e.distance)).toEqual(Array(6).fill(gate.distance - FEATHERS.barrelRunTicks));
    expect(crowd.every(e => e.runTicksLeft === 0)).toBe(true);
    expect(gate.hp).toBe(attackedHp);
    expect(state.lives).toBe(20);
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

  it('repairs only in setup with enough gold, buys one step and caps it', () => {
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
    expect(repairGate(state)).toEqual({ ok: true, cost: 23, gold: 7, hp: 480 });
    expect([state.gate.hp, state.gold]).toEqual([480, 7]);
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-full' });
    state.gate.hp = 0;
    state.gold = 30;
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-fallen' });
    expect([state.gate.hp, state.gold]).toEqual([0, 30]);
  });

  it.each([[319, 30, 479], [320, 30, 480], [400, 15, 480], [472, 2, 480], [479, 1, 480], [479.99, 1, 480]])(
    'at %d HP charges exactly %d gold to reach %d HP', (hp, cost, restored) => {
      const state = arena();
      state.gate.hp = hp;
      state.gold = cost - 1;
      expect(repairGate(state)).toEqual({ ok: false, reason: 'not-enough-gold' });
      expect([state.gate.hp, state.gold]).toEqual([hp, cost - 1]);
      state.gold = cost;
      expect(repairGate(state)).toEqual({ ok: true, cost, gold: 0, hp: restored });
    },
  );

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
    const attacker = { ...enemy('troll', 0, GATE_LINE, 0.1), burnDps: 60, burnTicksLeft: 1 };
    wave(state, [attacker, enemy('wolf', 1, 956)]);
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

  it.each(['barricade', 'guards'] as const)('a %s placed in the yard can intercept a walker after the breach', special => {
    const state = arena({ ...GATE, maxHp: 0.05 });
    state.fixedWaves = Array.from({ length: 6 }, () => WAVE);
    state.wave = 5;
    const goblin = { ...enemy('goblin'), slow: 0.5, slowTicksLeft: 500 };
    wave(state, [goblin]);
    expect(useSpecial(state, special, { x: 680, y: 256 }).ok).toBe(true);
    const first = Math.min(...state.blockers.map(blocker => blocker.distance));
    tick(state);
    expect(state.gate.fallen).toBe(true);
    for (let i = 0; i < (first - GATE_LINE) * 2 + 1; i++) tick(state);
    expect(goblin.distance).toBe(first);
    expect(featherEnemy(state, goblin)).toBe(true);
    for (let i = 0; i < FEATHERS.runTicks; i++) tick(state);
    expect(goblin.distance).toBe(first - FEATHERS.runTicks);
    expect(state.lives).toBe(20);
  });

  it('the Old Keep wall-walk covers the whole yard and Last stand saves more lives there', () => {
    const state = createKeep();
    const gate = state.gate!;
    state.gold += 35; // Preserve the gate trial’s original tower budget after the new site fee.
    expect(payQuartering(state).ok).toBe(true);
    for (const site of state.map.highSites!) expect(buildTower(state, site, 'longbow').ok).toBe(true);
    for (const site of [{ col: 22, row: 7 }, { col: 15, row: 13 }]) expect(upgradeTower(state, site).ok).toBe(true);
    for (let i = 0; i <= gate.yardLength; i++) {
      const target = enemy('goblin', 0, gate.distance + i);
      state.enemies = [target];
      expect(state.towers.some(tower => findTarget(state, tower) === target), JSON.stringify(positionAlongPath(state.map, target.distance))).toBe(true);
    }
    gate.hp = 4;
    wave(state, Array.from({ length: 30 }, (_, id) => enemy('goblin', id, gate.distance, ENEMY_STATS.goblin.hp)));
    tick(state);
    expect(state.enemies).toHaveLength(30);
    const normal = structuredClone(state);
    // Both gates break on the same tick. Suppress the one-time bonus in the control.
    normal.gate!.fallen = true;
    for (let i = 0; i <= gate.yardLength; i++) {
      tick(state);
      tick(normal);
    }
    expect(gate.hp).toBe(0);
    expect(normal.gate!.hp).toBe(0);
    expect(state.enemies).toHaveLength(0);
    expect(normal.enemies).toHaveLength(0);
    // The 30 Goblins all either die in the yard or cost one life.
    expect([state.lives, normal.lives]).toEqual([6, -2]); // 16 kills with the bonus, 8 at normal rate.
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
    expect(gate.distance).toBe(pathLength(state.map) - GATE.yardLength);
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

  it('uses the proportional price for both bot reserves', () => {
    for (const [bot, hp, reserve] of [[botGood, 288, 70], [botPerson, 144, 0]] as const) {
      const state = arena({ ...GATE, repairHp: 400 });
      state.gate.hp = hp;
      const price = bot === botGood ? 15 : 26;
      state.gold = price + reserve - 1;
      expect(bot.repair!(state)).toBe(false);
      state.gold++;
      expect(bot.repair!(state)).toBe(true);
      expect(repairGate(state)).toMatchObject({ ok: true, cost: price, gold: reserve });
    }
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
