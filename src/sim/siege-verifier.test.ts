// Independent checks of milestone 52a (the gate rule), written by the verifier
// from DESIGN.md "Siege gate", not from the implementer's tests.
import { describe, expect, it } from 'vitest';
import { buildTower, grantCheatGold } from './actions';
import { botGood, botPerson, runBot } from './bots';
import { levelStars } from './campaignProgress';
import { featherEnemy } from './feathers';
import { repairGate } from './gate';
import { callNextWave, createGame, startWave, tick } from './game';
import { LEVELS } from './levels';
import { createKeep } from './oldKeep';
import { shotCooldown, TOWER_DEFS, towerStats, towerStatsAt } from './towers';
import type { Enemy, EnemyType, GameState, MapDef, TowerType } from './types';
import { gameWaveDef } from './waves';

const LINE: MapDef = {
  id: 'siege-verifier', width: 960, height: 480,
  path: [{ x: 0, y: 256 }, { x: 960, y: 256 }],
  highSites: [{ col: 27, row: 4 }],
};
const FLAT: MapDef = { ...LINE, highSites: undefined };
const GATE = { maxHp: 480, repairCost: 30, repairHp: 160, yardLength: 360 };
const GATE_LINE = 960 - GATE.yardLength;
const WAVE = { groups: [{ type: 'goblin', count: 1, delay: 0, interval: 1 }] } as const;

function arena(gate = GATE, map: MapDef = LINE) {
  const state = createGame({ map, gate });
  return { ...state, gate: state.gate!, fixedWaves: [WAVE, WAVE, WAVE, WAVE, WAVE] };
}

function walker(type: EnemyType, id: number, distance = GATE_LINE, hp = 1_000_000): Enemy {
  return { type, id, distance, hp, slow: 0, slowTicksLeft: 0 };
}

function begin(state: GameState, enemies: Enemy[]) {
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = gameWaveDef(state, state.wave).groups.map(group => group.count);
  state.waveTick = 1;
  state.enemies = enemies;
}

describe('verifier: the gate under a crowd', () => {
  it('holds 30 goblins through the breach and charges every leak after exactly six seconds without towers', () => {
    const state = createKeep();
    const gate = state.gate!;
    gate.hp = 4;
    begin(state, Array.from({ length: 30 }, (_, i) => walker('goblin', i, gate.distance)));
    tick(state);
    // 30 goblins x 6 per second / 60 = 3 per tick.
    expect(gate.hp).toBeCloseTo(1, 9);
    tick(state);
    expect(gate.hp).toBe(0);
    expect(gate.fallen).toBe(true);
    expect(state.lives, 'nobody leaks on the tick that breaks it').toBe(20);
    expect(state.enemies).toHaveLength(30);
    tick(state);
    expect(state.enemies.map(e => e.distance)).toEqual(Array(30).fill(gate.distance + 1));
    expect(state.lives).toBe(20);
    for (let i = 1; i < 359; i++) tick(state);
    expect(state.lives).toBe(20);
    tick(state);
    expect(state.phase).toBe('lost');
    expect(state.lives).toBe(-10);
    expect(state.events.filter(e => e.kind === 'exit')).toHaveLength(30);
  });

  it('holds a walker that reaches the gate on the breaking tick, but not one that arrives a tick later', () => {
    const state = arena({ ...GATE, maxHp: 0.05 });
    begin(state, [walker('goblin', 0), walker('goblin', 1, GATE_LINE - 1), walker('goblin', 2, GATE_LINE - 2)]);
    tick(state);
    expect(state.gate.hp).toBe(0);
    expect(state.lives).toBe(20);
    expect(state.enemies.map(e => e.distance)).toEqual([GATE_LINE, GATE_LINE, GATE_LINE - 1]);
    tick(state);
    expect(state.enemies.map(e => e.distance)).toEqual([GATE_LINE + 1, GATE_LINE + 1, GATE_LINE]);
    for (let i = 1; i < 360; i++) tick(state);
    expect(state.lives).toBe(18);
    tick(state);
    expect(state.lives).toBe(17);
    expect(state.enemies).toHaveLength(0);
  });

  it('cannot be lost by ground enemies while it stands, but flyers alone can lose the level', () => {
    const ground = arena();
    begin(ground, Array.from({ length: 5 }, (_, i) => walker('goblin', i, GATE_LINE - 60)));
    for (let i = 0; i < 600; i++) tick(ground);
    expect(ground.lives).toBe(20);
    expect(ground.gate.hp).toBeLessThan(480);

    const sky = arena();
    begin(sky, Array.from({ length: 25 }, (_, i) => walker('harpy', i, 900)));
    for (let i = 0; i < 200 && sky.phase === 'wave'; i++) tick(sky);
    expect(sky.phase).toBe('lost');
    expect(sky.gate.hp).toBe(480);
    expect(sky.gate.fallen).toBe(false);
  });

  it('bounds a stall: one goblin breaks the gate and clears the wave by walking the yard', () => {
    const state = arena();
    begin(state, [walker('goblin', 0, GATE_LINE - 1)]);
    for (let i = 0; i < 4799; i++) tick(state);
    expect(state.gate.hp).toBeCloseTo(0.1, 9);
    tick(state);
    expect(state.gate.hp).toBe(0);
    for (let i = 0; i < 359; i++) tick(state);
    expect(state.lives).toBe(20);
    tick(state);
    expect(state.lives).toBe(19);
    expect(state.phase).toBe('setup');
    expect(state.gate.lastStandTicksLeft).toBe(0);
  });
});

describe('verifier: Last stand', () => {
  function breakGate() {
    const state = arena({ ...GATE, maxHp: 1 });
    state.gold = 500;
    expect(buildTower(state, { col: 27, row: 5 }, 'musketeer').ok).toBe(true);
    const target = walker('troll', 9, 880);
    begin(state, [walker('boss', 0), target]);
    return { state, target };
  }

  it('doubles the shot rate for the first 360 ticks from the break and not one tick longer', () => {
    const { state, target } = breakGate();
    const shots: number[] = [];
    for (let i = 0; i < 1080; i++) {
      target.distance = 880;
      target.hp = 1_000_000;
      state.enemies = state.gate.hp > 0 ? [walker('boss', 0), target] : [target];
      tick(state);
      if (state.shots.length) shots.push(i);
    }
    const during = shots.filter(i => i < 360).length;
    const after = shots.filter(i => i >= 360 && i < 720).length;
    const later = shots.filter(i => i >= 720).length;
    const cd = shotCooldown(towerStats({ type: 'musketeer', upgraded: false }, []));
    expect(during).toBe(Math.ceil(360 / (cd / 2)));
    expect(Math.abs(after * 2 - during)).toBeLessThanOrEqual(2);
    expect(Math.abs(later - after)).toBeLessThanOrEqual(1);
    expect(state.gate.lastStandTicksLeft).toBe(0);
  });

  it('does not run in setup, and a fallen gate never starts it again', () => {
    const { state } = breakGate();
    tick(state);
    expect(state.gate.lastStandTicksLeft).toBe(359);
    state.enemies = [];
    tick(state);
    expect(state.phase).toBe('setup');
    const left = state.gate.lastStandTicksLeft;
    expect(left).toBeGreaterThan(300);
    for (let i = 0; i < 5000; i++) tick(state);
    expect(state.gate.lastStandTicksLeft).toBe(left);
    // Another wave, another crowd at the exit: leaks cost lives, the timer only counts down.
    begin(state, [walker('boss', 5, 960)]);
    tick(state);
    expect(state.lives).toBe(20 - 5);
    expect(state.gate.lastStandTicksLeft).toBeLessThan(left);
    expect(state.gate.hp).toBe(0);
    state.gold = 500;
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-fallen' });
    expect(grantCheatGold(state).ok).toBe(true);
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-fallen' });
  });
});

describe('verifier: repair', () => {
  it('charges one gold for a one-point top-up, stops at full, and cannot be spammed past the cap', () => {
    const state = arena();
    state.gate.hp = 479;
    state.gold = 1000;
    expect(repairGate(state)).toEqual({ ok: true, cost: 1, hp: 480, gold: 999 });
    expect(repairGate(state)).toEqual({ ok: false, reason: 'gate-full' });
    state.gate.hp = 1;
    let paid = 0;
    for (let i = 0; i < 20; i++) {
      const r = repairGate(state);
      if (r.ok) paid += r.cost;
    }
    expect(paid).toBe(90);
    expect(state.gate.hp).toBe(480);
    expect(state.gold).toBe(909);
  });

  it('refuses after a win or loss and while a wave is on', () => {
    const state = arena();
    state.gate.hp = 100;
    begin(state, [walker('goblin', 0, 0)]);
    expect(repairGate(state)).toMatchObject({ ok: false, reason: 'not-in-setup' });
    state.phase = 'won';
    expect(repairGate(state)).toMatchObject({ ok: false, reason: 'not-in-setup' });
    state.phase = 'lost';
    expect(repairGate(state)).toMatchObject({ ok: false, reason: 'not-in-setup' });
    expect(repairGate(createGame({ map: FLAT }))).toMatchObject({ ok: false });
  });

  it('works with cheat gold, and the cheat still voids stars', () => {
    const state = arena();
    state.gate.hp = 10;
    state.gold = 0;
    expect(repairGate(state)).toMatchObject({ ok: false, reason: 'not-enough-gold' });
    grantCheatGold(state);
    expect(repairGate(state).ok).toBe(true);
    expect(levelStars({ ...state, level: LEVELS[0], phase: 'won' })).toBe(0);
  });
});

describe('verifier: feathers at the gate', () => {
  it('a crowd of tarred goblins run back and return, with no damage and no leaks while they are away', () => {
    const state = arena();
    const crowd = Array.from({ length: 6 }, (_, i) => ({ ...walker('goblin', i), slow: 0.4, slowTicksLeft: 100_000 }));
    begin(state, crowd);
    tick(state);
    const hp = state.gate.hp;
    expect(hp).toBeCloseTo(480 - 36 / 60, 9);
    for (const e of crowd) expect(featherEnemy(state, e)).toBe(true);
    const awayHp: number[] = [];
    let back = 0;
    for (let i = 0; i < 400; i++) {
      tick(state);
      if (state.enemies.every(e => e.distance < GATE_LINE)) { back++; awayHp.push(state.gate.hp); }
      if (back > 0 && state.gate.hp < hp) break;
    }
    expect(back).toBeGreaterThan(80);
    expect(state.lives).toBe(20);
    expect(state.gate.hp).toBeLessThan(hp);
    expect(state.enemies).toHaveLength(6);
    expect(awayHp.every(h => h === hp)).toBe(true);
  });

  it('an early call with attackers at the gate leaves them hitting it and wave two adds to the pile', () => {
    const state = arena();
    begin(state, [walker('troll', 0)]);
    tick(state);
    const hp = state.gate.hp;
    expect(callNextWave(state).ok).toBe(true);
    expect(state.enemies.some(e => e.id === 0)).toBe(true);
    tick(state);
    expect(state.gate.hp).toBeLessThan(hp);
    expect(state.lives).toBe(20);
  });
});

describe('verifier: high ground', () => {
  const TYPES = Object.keys(TOWER_DEFS) as TowerType[];

  it('changes only the maximum range, only on a marked site, for every tower and level', () => {
    const high = { col: 27, row: 4 };
    const plain = { col: 28, row: 4 };
    const state = arena();
    for (const type of TYPES) {
      for (const tower of [{ type, upgraded: false }, { type, upgraded: true }, { type, upgraded: true, path: 'A' as const }]) {
        const base = towerStats(tower, state.boons, state.level);
        expect(towerStatsAt(state, { ...tower, cell: plain })).toEqual(base);
        expect(towerStatsAt(state, { ...tower, cell: high })).toEqual({ ...base, range: base.range * 1.1 });
      }
    }
    const flat = createGame({ map: FLAT, gate: GATE });
    expect(towerStatsAt(flat, { type: 'musketeer', upgraded: false, cell: high })).toEqual(towerStats({ type: 'musketeer', upgraded: false }, []));
  });

  it('applies 10% after boons', () => {
    const state = arena();
    state.boons = ['longBarrels'];
    const cell = { col: 27, row: 4 };
    const base = towerStats({ type: 'mortar', upgraded: false }, state.boons, state.level).range;
    expect(base).toBeGreaterThan(TOWER_DEFS.mortar.base.range);
    expect(towerStatsAt(state, { type: 'mortar', upgraded: false, cell }).range).toBeCloseTo(base * 1.1, 9);
  });
});

describe('verifier: bots and the Old Keep', () => {
  it('Good and Person never repair mid-wave and do repair in setup when the rule says so, in a real run', () => {
    const state = arena();
    state.gate.hp = 100;
    state.gold = 300;
    const good = runBot(state, botGood, 1, 1);
    expect(good.log.filter(s => s.action === 'repairGate')).toHaveLength(1);
    const second = arena();
    second.gate.hp = 100;
    second.gold = 300;
    const person = runBot(second, botPerson, 1, 1);
    expect(person.log.filter(s => s.action === 'repairGate')).toHaveLength(1);
  });

  it('still breaches the regular Old Keep gate in a bot run and holds a much stronger gate', () => {
    const outcome = (maxHp: number) => {
      const state = createKeep();
      state.gate!.maxHp = maxHp;
      state.gate!.hp = maxHp;
      const run = runBot(state, botGood);
      return { lives: run.state.lives, fallen: run.state.gate!.fallen, hp: run.state.gate!.hp, repairs: run.log.filter(s => s.action === 'repairGate').length };
    };
    expect(outcome(480)).toMatchObject({ fallen: true, hp: 0, repairs: 0 });
    expect(outcome(100_000)).toMatchObject({ lives: 20, fallen: false });
  }, 120_000);

  it('Old Keep campaign stars are unaffected: no level before 21 has a gate', () => {
    for (const level of LEVELS) expect(level.gate).toBeUndefined();
  });
});
