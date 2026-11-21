// Verifier probes for milestone 24 (targeting modes), written without
// reading the implementer's test geometry.
//
// Geometry: one tower on cell (9,4), centre T = (304,144). The path's third
// leg runs along y = 96 from x 160 (path distance 304) to x 420 (564), so an
// enemy at path distance D in [304,564] stands at (D - 144, 96) and is
// hypot(D - 448, 48) px from T:
//   D 400 -> (256,96) hypot(48,48) = 67.88     D 420 -> (276,96) hypot(28,48) = 55.57
//   D 430 -> (286,96) hypot(18,48) = 51.26     D 448 -> (304,96)              = 48
//   D 470 -> (326,96) hypot(22,48) = 52.80     D 480 -> (336,96) hypot(32,48) = 57.69
//   D 500 -> (356,96) hypot(52,48) = 70.77     D 540 -> (396,96) hypot(92,48) = 103.77
// Decoys outside a Musketeer's 110: D 100 -> (100,240), hypot(204,96) = 225.46;
// D 700 -> (420,232) on the fourth leg, hypot(116,88) = 145.60.
// D 600 -> (420,132), hypot(116,12) = 116.62 (inside a Mortar's 70..220).
import { describe, expect, it } from 'vitest';
import { buildTower, sellTower, setTargeting, towerAt, upgradeTower } from './actions';
import { enemyPosition, findTarget, fireTowers } from './combat';
import { createGame } from './game';
import { cellCenter, type Cell } from './grid';
import type { Enemy, EnemyType, GameState, TargetingMode, TowerType } from './types';

const T: Cell = { col: 9, row: 4 };

const e = (id: number, distance: number, hp: number, type: EnemyType = 'goblin'): Enemy => ({ id, type, hp, distance, slow: 0, slowTicksLeft: 0 });

function field(enemies: Enemy[], type: TowerType, mode: TargetingMode): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.enemies = enemies;
  expect(buildTower(s, T, type).ok).toBe(true);
  expect(setTargeting(s, T, mode)).toEqual({ ok: true });
  return s;
}

const pick = (enemies: Enemy[], type: TowerType, mode: TargetingMode) => {
  const s = field(enemies, type, mode);
  return findTarget(s, s.towers[0])?.id;
};

const fromT = (d: number) => {
  const p = enemyPosition(e(0, d, 1));
  const c = cellCenter(T);
  return Math.round(Math.hypot(p.x - c.x, p.y - c.y) * 100) / 100;
};

describe('verifier m24: geometry', () => {
  it('T is (304,144) and the distances in the header hold', () => {
    expect(cellCenter(T)).toEqual({ x: 304, y: 144 });
    expect(enemyPosition(e(0, 448, 1))).toEqual({ x: 304, y: 96 });
    expect([400, 420, 430, 448, 470, 480, 500, 540].map(fromT)).toEqual([67.88, 55.57, 51.26, 48, 52.8, 57.69, 70.77, 103.77]);
    expect([100, 700, 600].map(fromT)).toEqual([225.46, 145.6, 116.62]);
  });
});

describe('verifier m24 (a): three enemies, distinct distance and hp', () => {
  // In range: id 4 at 400 with 20 hp, id 9 at 448 with 30 hp, id 6 at 500 with 10 hp.
  // Out of range trolls: id 1 at 100 (lowest distance, 500 hp), id 0 at 700 (highest distance, 500 hp).
  const es = () => [e(9, 448, 30), e(0, 700, 500, 'troll'), e(6, 500, 10), e(1, 100, 500, 'troll'), e(4, 400, 20)];
  it.each([
    ['first', 6],
    ['last', 4],
    ['strongest', 9],
  ] as const)('%s picks id %i and the shot lands on it', (mode, id) => {
    expect(pick(es(), 'musketeer', mode)).toBe(id);
    const s = field(es(), 'musketeer', mode);
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([id]);
    expect(s.events.filter((x) => x.kind === 'hit')).toEqual([{ kind: 'hit', enemyId: id, cell: T, tower: 'musketeer', damage: 12 }]);
  });
});

describe('verifier m24 (b): ties', () => {
  it('first, same distance: lower id (in either array order)', () => {
    expect(pick([e(8, 448, 30), e(2, 448, 30), e(1, 400, 30)], 'musketeer', 'first')).toBe(2);
    expect(pick([e(2, 448, 30), e(8, 448, 30), e(1, 400, 30)], 'musketeer', 'first')).toBe(2);
  });
  it('last, same distance: lower id', () => {
    expect(pick([e(8, 400, 30), e(2, 400, 30), e(1, 448, 30)], 'musketeer', 'last')).toBe(2);
    expect(pick([e(2, 400, 30), e(8, 400, 30), e(1, 448, 30)], 'musketeer', 'last')).toBe(2);
  });
  it('strongest, equal hp: further along (id 8 at 480 over id 2 at 400; id 1 at 500 is weaker)', () => {
    expect(pick([e(2, 400, 30), e(8, 480, 30), e(1, 500, 20)], 'musketeer', 'strongest')).toBe(8);
    expect(pick([e(1, 500, 20), e(8, 480, 30), e(2, 400, 30)], 'musketeer', 'strongest')).toBe(8);
  });
  it('strongest, equal hp and distance: lower id', () => {
    expect(pick([e(8, 448, 30), e(2, 448, 30), e(1, 448, 20)], 'musketeer', 'strongest')).toBe(2);
    expect(pick([e(2, 448, 30), e(8, 448, 30), e(1, 448, 20)], 'musketeer', 'strongest')).toBe(2);
  });
});

describe('verifier m24 (c): strongest reads current hp', () => {
  it('30 hp then 18 hp: the second shot moves to the 28 hp enemy', () => {
    // id 1 at 400 with 30 hp, id 2 at 448 with 28 hp. Musketeer 12 damage, cooldown 60 ticks.
    const s = field([e(1, 400, 30), e(2, 448, 28)], 'musketeer', 'strongest');
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([1]);
    expect(s.enemies.map((x) => x.hp)).toEqual([18, 28]);
    expect(s.towers[0].cooldownTicks).toBe(60);
    s.shots = [];
    for (let i = 0; i < 59; i++) fireTowers(s);
    expect(s.shots).toEqual([]);
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([2]);
    expect(s.enemies.map((x) => x.hp)).toEqual([18, 16]);
    // 18 > 16: back to id 1.
    s.shots = [];
    for (let i = 0; i < 60; i++) fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([1]);
  });
});

describe('verifier m24 (d): Mortar on last and the minimum range', () => {
  it('skips id 1 at 420 (55.57 px, inside 70) for id 2 at 540 (103.77 px)', () => {
    const es = () => [e(1, 420, 30), e(2, 540, 30), e(3, 600, 30)];
    expect(pick(es(), 'mortar', 'last')).toBe(2);
    expect(pick(es(), 'mortar', 'first')).toBe(3);
    // A Musketeer in the same spot does take id 1.
    expect(pick(es(), 'musketeer', 'last')).toBe(1);
  });
  it('nothing but enemies inside the minimum range: no target, no shot', () => {
    const s = field([e(1, 420, 30), e(2, 448, 500, 'troll')], 'mortar', 'last');
    expect(findTarget(s, s.towers[0])).toBeUndefined();
    fireTowers(s);
    expect(s.shots).toEqual([]);
    s.towers[0].targeting = 'strongest';
    expect(findTarget(s, s.towers[0])).toBeUndefined();
  });
});

describe('verifier m24 (e): Cannon on strongest ignores the Harpy', () => {
  it('Harpy 40 hp at 448 and Goblin 30 hp at 430: the Goblin; the Harpy is untouched', () => {
    const s = field([e(1, 448, 40, 'harpy'), e(2, 430, 30)], 'cannon', 'strongest');
    expect(findTarget(s, s.towers[0])?.id).toBe(2);
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([2]);
    expect(s.enemies.map((x) => [x.id, x.hp])).toEqual([
      [1, 40],
      [2, 5],
    ]);
  });
});

describe('verifier m24 (f): Tar Pit on last slows the last enemy', () => {
  it('id 1 at 420 is slowed 40% for 120 ticks; id 2 at 470 is not', () => {
    const s = field([e(2, 470, 30), e(1, 420, 30)], 'tarpit', 'last');
    fireTowers(s);
    const byId = Object.fromEntries(s.enemies.map((x) => [x.id, x]));
    expect([byId[1].hp, byId[1].slow, byId[1].slowTicksLeft]).toEqual([27, 0.4, 120]);
    expect([byId[2].hp, byId[2].slow, byId[2].slowTicksLeft]).toEqual([30, 0, 0]);
    expect(s.events.filter((x) => x.kind === 'slowed')).toEqual([{ kind: 'slowed', enemyId: 1, slow: 0.4, ticks: 120 }]);
    // On first, the same field slows id 2 instead.
    const f = field([e(2, 470, 30), e(1, 420, 30)], 'tarpit', 'first');
    fireTowers(f);
    expect(f.events.filter((x) => x.kind === 'slowed').map((x) => x.enemyId)).toEqual([2]);
  });
});

describe('verifier m24 (g): Fire Pot on strongest takes the boss', () => {
  it('boss 4000 hp at 420 over a Goblin at 470 (first would take the Goblin); the boss burns', () => {
    const es = () => [e(2, 470, 30), e(1, 420, 4000, 'boss')];
    expect(pick(es(), 'firepot', 'first')).toBe(2);
    const s = field(es(), 'firepot', 'strongest');
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([1]);
    const boss = s.enemies.find((x) => x.id === 1)!;
    const goblin = s.enemies.find((x) => x.id === 2)!;
    expect([boss.hp, boss.burnDps, boss.burnTicksLeft]).toEqual([3996, 5, 180]);
    expect([goblin.hp, goblin.burnDps ?? 0, goblin.burnTicksLeft ?? 0]).toEqual([30, 0, 0]);
  });
});

describe('verifier m24 (h): setTargeting refusals', () => {
  it.each(['won', 'lost'] as const)('%s: game-over, and the tower, gold and events are unchanged', (phase) => {
    const s = createGame();
    buildTower(s, T, 'musketeer');
    setTargeting(s, T, 'last');
    s.phase = phase;
    const before = JSON.stringify(s);
    for (const mode of ['first', 'last', 'strongest'] as const) {
      expect(setTargeting(s, T, mode)).toEqual({ ok: false, reason: 'game-over' });
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(towerAt(s, T)?.targeting).toBe('last');
    // game-over wins over no-tower.
    expect(setTargeting(s, { col: 0, row: 0 }, 'last')).toEqual({ ok: false, reason: 'game-over' });
  });
  it('empty cell: no-tower, nothing changes', () => {
    const s = createGame();
    buildTower(s, T, 'musketeer');
    const before = JSON.stringify(s);
    expect(setTargeting(s, { col: 10, row: 4 }, 'strongest')).toEqual({ ok: false, reason: 'no-tower' });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('verifier m24 (i): the mode across sell, rebuild and upgrade', () => {
  it('sell and rebuild resets to first (same and different tower type)', () => {
    const s = createGame();
    s.gold = 10_000;
    buildTower(s, T, 'musketeer');
    setTargeting(s, T, 'strongest');
    expect(sellTower(s, T).ok).toBe(true);
    buildTower(s, T, 'musketeer');
    expect(towerAt(s, T)?.targeting).toBe('first');
    setTargeting(s, T, 'last');
    sellTower(s, T);
    buildTower(s, T, 'cannon');
    expect(towerAt(s, T)?.targeting).toBe('first');
  });
  it('an upgrade keeps the mode, and the upgraded tower still shoots by it', () => {
    const s = field([e(4, 400, 20), e(9, 448, 30), e(6, 500, 10)], 'musketeer', 'last');
    expect(upgradeTower(s, T).ok).toBe(true);
    expect(towerAt(s, T)).toMatchObject({ upgraded: true, targeting: 'last' });
    fireTowers(s);
    expect(s.shots.map((x) => x.targetId)).toEqual([4]);
  });
});
