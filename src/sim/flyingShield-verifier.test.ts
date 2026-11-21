// Verifier (milestone 22): independent probes of the Harpy (flying) and
// Shieldbearer (shield) rules from docs/SCOPE-v4.md, with geometry chosen
// apart from flyingShield.test.ts. Exact values throughout.
//
// Geometry. The path runs (0,240) -> (160,240) -> (160,96) -> (420,96) -> ...
// Cell M = (7,7), centre (240,240): path distance 220 is (160,180), which is
// sqrt(80^2 + 60^2) = 100 px away; path distance 90 is (90,240), 150 px away
// on the same row. Cell B = (2,5), centre (80,176): path distance 128 is
// (128,240), sqrt(48^2 + 64^2) = 80 px away, inside every base range but the
// Mortar's; distance 148 is (148,240), 20 px further along the same segment.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { burnEnemies, enemyPosition, findTarget, fireTowers } from './combat';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';
import { cellCenter, type Cell } from './grid';
import { TOWER_DEFS } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

const M: Cell = { col: 7, row: 7 };
const B: Cell = { col: 2, row: 5 };

function enemy(id: number, type: EnemyType, distance: number, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

function arena(cell: Cell, tower: TowerType, upgraded: boolean, enemies: Enemy[]): GameState {
  const s = createGame();
  s.gold = 1000;
  expect(buildTower(s, cell, tower).ok).toBe(true);
  if (upgraded) expect(upgradeTower(s, cell).ok).toBe(true);
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 50;
  return s;
}

const px = (cell: Cell, distance: number) => {
  const c = cellCenter(cell);
  const p = enemyPosition(enemy(0, 'goblin', distance));
  return Math.hypot(p.x - c.x, p.y - c.y);
};
const kinds = (s: GameState, kind: string) => s.events.filter((e) => e.kind === kind);

describe('verifier geometry', () => {
  it('M is 100 px from distance 220 and 150 px from distance 90; B is 80 px from 128 and 128 -> 148 is 20 px', () => {
    expect([px(M, 220), px(M, 90), px(B, 128)]).toEqual([100, 150, 80]);
    const a = enemyPosition(enemy(0, 'harpy', 128));
    const b = enemyPosition(enemy(0, 'harpy', 148));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBe(20);
    expect(TOWER_DEFS.mortar.upgraded).toMatchObject({ range: 220, minRange: 70, damage: 70, splashRadius: 70 });
    expect(TOWER_DEFS.cannon.base).toMatchObject({ range: 90, damage: 25, splashRadius: 40 });
  });
});

describe('(a) upgraded Mortar and a Harpy', () => {
  it('with a Harpy at 100 px (further along the path) and a Goblin at 150 px, it shoots the Goblin', () => {
    const s = arena(M, 'mortar', true, [enemy(0, 'harpy', 220), enemy(1, 'goblin', 90)]);
    expect(findTarget(s, s.towers[0])?.id).toBe(1);
    fireTowers(s);
    expect(s.shots.map((x) => [x.tower, x.targetId])).toEqual([['mortar', 1]]);
    // Goblin: 30 - 70 < 0, dead, 4 gold. Harpy untouched: 40.
    expect(kinds(s, 'hit')).toEqual([expect.objectContaining({ enemyId: 1, damage: 70 })]);
    expect(s.enemies.map((e) => [e.id, e.hp])).toEqual([[0, 40]]);
    expect(s.gold).toBe(1000 - 110 - 80 + 4);
  });

  it('with only the Harpy in range it never fires over 600 ticks: no shot, no hit, hp stays 40', () => {
    const s = arena(M, 'mortar', true, [enemy(0, 'harpy', 220)]);
    let shots = 0;
    let hits = 0;
    for (let i = 0; i < 600; i++) {
      fireTowers(s);
      shots += s.shots.length;
      hits += kinds(s, 'hit').length;
      s.events = [];
    }
    expect([shots, hits, s.enemies[0].hp, s.towers[0].cooldownTicks]).toEqual([0, 0, 40, 0]);
  });
});

describe('(b) Cannon splash and a Harpy', () => {
  it('a Cannon shot at a Goblin 80 px away hits only the Goblin, though a Harpy is 20 px from it (inside the 40 px splash)', () => {
    const s = arena(B, 'cannon', false, [enemy(0, 'goblin', 128, 100), enemy(1, 'harpy', 148)]);
    expect(findTarget(s, s.towers[0])?.id).toBe(0);
    fireTowers(s);
    expect(s.shots.map((x) => [x.targetId, x.splashRadius])).toEqual([[0, 40]]);
    // Goblin 100 - 25 = 75; Harpy 40 untouched.
    expect(kinds(s, 'hit')).toEqual([expect.objectContaining({ enemyId: 0, tower: 'cannon', damage: 25 })]);
    expect(s.enemies.map((e) => e.hp)).toEqual([75, 40]);
  });
});

describe('(c) Fire Pot impact on a Harpy', () => {
  it('hp 40 -> 36, burn fields stay 0, and no burn event in the next 200 burn steps', () => {
    const s = arena(B, 'firepot', false, [enemy(0, 'harpy', 128)]);
    expect(findTarget(s, s.towers[0])?.id).toBe(0);
    fireTowers(s);
    expect(kinds(s, 'hit')).toEqual([expect.objectContaining({ enemyId: 0, tower: 'firepot', damage: 4 })]);
    expect(s.enemies[0]).toMatchObject({ hp: 36, burnDps: 0, burnTicksLeft: 0 });
    s.events = [];
    let burns = 0;
    for (let i = 0; i < 200; i++) {
      burnEnemies(s);
      burns += kinds(s, 'burn').length;
      s.events = [];
    }
    expect([burns, s.enemies[0].hp]).toEqual([0, 36]);
  });
});

describe('(d) Tar Pit and a Harpy', () => {
  it('never fires at a lone Harpy in 300 ticks; the Harpy is never slowed', () => {
    const s = arena(B, 'tarpit', true, [enemy(0, 'harpy', 128)]);
    expect(findTarget(s, s.towers[0])).toBeUndefined();
    let shots = 0;
    for (let i = 0; i < 300; i++) {
      fireTowers(s);
      shots += s.shots.length;
    }
    expect([shots, s.enemies[0].hp, s.enemies[0].slow, s.enemies[0].slowTicksLeft]).toEqual([0, 40, 0, 0]);
  });

  it('a Tar Pit shot at a Goblin 20 px from a Harpy slows the Goblin only (no slowed event for the Harpy)', () => {
    const s = arena(B, 'tarpit', false, [enemy(0, 'goblin', 128), enemy(1, 'harpy', 148)]);
    fireTowers(s);
    // Goblin 30 - 3 = 27, slow 0.4 for 120 ticks; Harpy 40, slow 0.
    expect(kinds(s, 'slowed')).toEqual([{ kind: 'slowed', enemyId: 0, slow: 0.4, ticks: 120 }]);
    expect(s.enemies[0]).toMatchObject({ hp: 27, slow: 0.4, slowTicksLeft: 120 });
    expect(s.enemies[1]).toMatchObject({ hp: 40, slow: 0, slowTicksLeft: 0 });
  });
});

describe('(e) Shieldbearer damage', () => {
  const cases: [TowerType, boolean, number, number][] = [
    ['longbow', false, 4, 2], // 4 <= 10: 4 / 2 = 2
    ['longbow', true, 9, 4.5], // 9 <= 10: 9 / 2 = 4.5
    ['firepot', false, 4, 2], // impact 4 / 2 = 2
    ['musketeer', false, 12, 12], // 12 > 10: full
    ['cannon', false, 25, 25], // 25 > 10: full
  ];
  for (const [tower, upgraded, base, dealt] of cases) {
    it(`${upgraded ? 'upgraded' : 'base'} ${tower}: base ${base} deals ${dealt}, hp 120 -> ${120 - dealt}`, () => {
      const s = arena(B, tower, upgraded, [enemy(0, 'shieldbearer', 128)]);
      const stats = upgraded ? TOWER_DEFS[tower].upgraded : TOWER_DEFS[tower].base;
      expect(stats.damage).toBe(base);
      fireTowers(s);
      expect(kinds(s, 'hit')).toEqual([expect.objectContaining({ enemyId: 0, tower, damage: dealt })]);
      expect(s.enemies[0].hp).toBe(120 - dealt);
    });
  }

  it('burn is full: 60 burn steps at 5/60 take exactly 5 (hp 118 after the halved impact -> 113)', () => {
    const s = arena(B, 'firepot', false, [enemy(0, 'shieldbearer', 128)]);
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 118, burnDps: 5, burnTicksLeft: 180 });
    s.events = [];
    let total = 0;
    for (let i = 0; i < 60; i++) {
      burnEnemies(s);
      const burn = kinds(s, 'burn');
      expect(burn).toEqual([{ kind: 'burn', enemyId: 0, damage: 5 / 60 }]);
      total += (burn[0] as { damage: number }).damage;
      s.events = [];
    }
    expect(total).toBeCloseTo(5, 9);
    expect(s.enemies[0].hp).toBeCloseTo(113, 9);
    expect(s.enemies[0].burnTicksLeft).toBe(120);
  });
});

describe('(f) Shieldbearer bounty', () => {
  it('a Shieldbearer at 2 hp killed by a halved base Longbow shot (4 -> 2) pays 9 gold once, one kill event', () => {
    const s = arena(B, 'longbow', false, [enemy(0, 'shieldbearer', 128, 2)]);
    const gold = s.gold;
    fireTowers(s);
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(gold + 9);
    expect(kinds(s, 'kill')).toEqual([{ kind: 'kill', enemyId: 0, enemyType: 'shieldbearer', bounty: 9, cause: 'shot' }]);
    burnEnemies(s);
    fireTowers(s);
    expect(s.gold).toBe(gold + 9);
  });
});

describe('(g) wave spawns by type', () => {
  function spawns(wave: number): Record<string, number> {
    const s = createGame();
    s.wave = wave - 1;
    expect(startWave(s)).toEqual({ ok: true, wave });
    const counts: Record<string, number> = {};
    while (s.phase === 'wave') {
      tick(s);
      for (const e of s.events) if (e.kind === 'spawn') counts[e.enemyType] = (counts[e.enemyType] ?? 0) + 1;
    }
    return counts;
  }

  it('wave 4 spawns 10 Wolves and exactly 4 Harpies; wave 6 spawns 18 Goblins, 14 Wolves and exactly 3 Shieldbearers', () => {
    expect(spawns(4)).toEqual({ wolf: 10, harpy: 4 });
    expect(spawns(6)).toEqual({ goblin: 18, wolf: 14, shieldbearer: 3 });
  });

  it('the milestone 12 groups are unchanged and the new groups are the last ones of waves 4 to 8 and 10 only', () => {
    const g = (type: EnemyType, count: number, interval: number, delay = 0) => ({ type, count, interval, delay });
    const before = [
      [g('goblin', 8, 1.0)],
      [g('goblin', 12, 0.8)],
      [g('goblin', 8, 1.0), g('wolf', 6, 0.6, 4)],
      [g('wolf', 10, 0.6)],
      [g('goblin', 12, 0.7), g('troll', 2, 3, 2)],
      [g('goblin', 18, 0.5), g('wolf', 14, 0.5, 5)],
      [g('wolf', 10, 0.5), g('troll', 10, 2.5, 1)],
      [g('goblin', 20, 0.5), g('wolf', 10, 0.6, 6), g('troll', 8, 3, 3)],
      [g('wolf', 12, 0.5), g('troll', 6, 2)],
      [g('wolf', 8, 0.5, 4), g('troll', 12, 2)],
    ];
    const isNew = (t: EnemyType) => t === 'harpy' || t === 'shieldbearer';
    WAVES.forEach((w, i) => {
      expect(w.groups.slice(0, before[i].length), `wave ${i + 1}`).toEqual(before[i]);
      expect(w.groups.slice(before[i].length).every((x) => isNew(x.type)), `wave ${i + 1}`).toBe(true);
    });
    expect(WAVES.map((w) => w.groups.filter((x) => isNew(x.type)).length)).toEqual([0, 0, 0, 1, 1, 1, 1, 2, 0, 2]);
  });
});
