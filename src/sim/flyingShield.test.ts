// Milestone 22: the Harpy (flying) and Shieldbearer (shield) rules from
// docs/SCOPE-v4.md, one test per rule.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { burnEnemies, canTarget, enemyPosition, findTarget, fireTowers, KILL_EPSILON } from './combat';
import { ENEMY_STATS, SHIELD_THRESHOLD, shotDamage } from './enemies';
import { createGame } from './game';
import { cellCenter, type Cell } from './grid';
import { TOWER_DEFS } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';
import { WAVES } from './waves';

// Cell A, centre (80,176): path distance 80 is (80,240), 64 px away (inside
// every tower's range but the Mortar's 70 px minimum); path distance 224 is
// (160,176), 80 px away (inside the Mortar's ring).
const A: Cell = { col: 2, row: 5 };
const NEAR = 80;
const MORTAR_OK = 224;

function enemy(id: number, distance: number, type: EnemyType, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, hp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 };
}

function arena(enemies: Enemy[], tower: TowerType, upgraded = false): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  expect(buildTower(s, A, tower).ok).toBe(true);
  if (upgraded) expect(upgradeTower(s, A).ok).toBe(true);
  return s;
}

const hits = (s: GameState) => s.events.filter((e) => e.kind === 'hit');

describe('geometry used by these tests', () => {
  it('A is 64 px from distance 80 and 80 px from distance 224', () => {
    const c = cellCenter(A);
    const d = (dist: number) => {
      const p = enemyPosition(enemy(0, dist, 'goblin'));
      return Math.hypot(p.x - c.x, p.y - c.y);
    };
    expect([d(NEAR), d(MORTAR_OK)]).toEqual([64, 80]);
  });
});

describe('enemy stats (docs/SCOPE-v4.md)', () => {
  it('Harpy 40 hp, 90 px/s, 7 gold, flying; Shieldbearer 120 hp, 45 px/s, 9 gold, shielded; the others neither', () => {
    expect(ENEMY_STATS.harpy).toEqual({ hp: 40, speed: 90, bounty: 7, flying: true, shield: false });
    expect(ENEMY_STATS.shieldbearer).toEqual({ hp: 120, speed: 45, bounty: 9, flying: false, shield: true });
    for (const type of ['goblin', 'wolf', 'troll'] as const) {
      expect([ENEMY_STATS[type].flying, ENEMY_STATS[type].shield]).toEqual([false, false]);
    }
  });

  it('Harpies enter the wave table on wave 4 and Shieldbearers on wave 6', () => {
    const first = (type: EnemyType) => WAVES.findIndex((w) => w.groups.some((g) => g.type === type)) + 1;
    expect(first('harpy')).toBe(4);
    expect(first('shieldbearer')).toBe(6);
  });
});

describe('Harpy: flying', () => {
  for (const [tower, dist] of [['tarpit', NEAR], ['cannon', NEAR], ['mortar', MORTAR_OK]] as const) {
    it(`a ${tower} never targets a Harpy, even alone in range, and fires at a ground enemy behind it`, () => {
      const alone = arena([enemy(0, dist, 'harpy')], tower);
      expect(findTarget(alone, alone.towers[0])).toBeUndefined();
      fireTowers(alone);
      expect(alone.shots).toEqual([]);
      expect(alone.enemies[0].hp).toBe(40);

      const both = arena([enemy(0, dist + 4, 'harpy'), enemy(1, dist, 'goblin')], tower);
      expect(findTarget(both, both.towers[0])?.id).toBe(1);
      expect(canTarget(tower, both.enemies[0])).toBe(false);
    });
  }

  for (const tower of ['musketeer', 'longbow'] as const) {
    it(`a ${tower} targets a Harpy ahead of a Goblin and deals full damage`, () => {
      const s = arena([enemy(0, NEAR + 4, 'harpy'), enemy(1, NEAR, 'goblin')], tower);
      fireTowers(s);
      const dmg = TOWER_DEFS[tower].base.damage;
      expect(hits(s)).toEqual([expect.objectContaining({ enemyId: 0, tower, damage: dmg })]);
      expect(s.enemies[0].hp).toBe(40 - dmg);
    });
  }

  for (const [tower, dist] of [['cannon', NEAR], ['mortar', MORTAR_OK]] as const) {
    it(`${tower} splash skips a Harpy on top of its ground target`, () => {
      const s = arena([enemy(0, dist, 'harpy'), enemy(1, dist, 'goblin', 1000)], tower);
      fireTowers(s);
      expect(s.shots).toHaveLength(1);
      expect(s.shots[0].targetId).toBe(1);
      expect(hits(s).map((h) => h.enemyId)).toEqual([1]);
      expect(s.enemies.find((e) => e.id === 0)?.hp).toBe(40);
    });
  }

  it('a Fire Pot impact hits a Harpy for 4 but applies no burn; the same shot burns a Goblin', () => {
    const s = arena([enemy(0, NEAR, 'harpy')], 'firepot', true);
    fireTowers(s);
    expect(hits(s)).toEqual([expect.objectContaining({ enemyId: 0, tower: 'firepot', damage: 4 })]);
    expect(s.enemies[0]).toMatchObject({ hp: 36, burnDps: 0, burnTicksLeft: 0 });
    burnEnemies(s);
    expect(s.events.filter((e) => e.kind === 'burn')).toEqual([]);

    const g = arena([enemy(0, NEAR, 'goblin')], 'firepot', true);
    fireTowers(g);
    expect(g.enemies[0]).toMatchObject({ hp: 26, burnDps: 8, burnTicksLeft: 240 });
  });
});

describe('Shieldbearer: shield', () => {
  it(`shots of ${SHIELD_THRESHOLD} or less are halved; shots over it are full`, () => {
    expect(SHIELD_THRESHOLD).toBe(10);
    const sb = { type: 'shieldbearer' } as const;
    expect([4, 9, 10, 10.5, 12, 22].map((d) => shotDamage(sb, d))).toEqual([2, 4.5, 5, 10.5, 12, 22]);
    expect(shotDamage({ type: 'troll' }, 4)).toBe(4);
  });

  const cases: [TowerType, boolean, number, number][] = [
    ['longbow', false, NEAR, 2],
    ['longbow', true, NEAR, 4.5],
    ['firepot', false, NEAR, 2],
    ['tarpit', false, NEAR, 1.5],
    ['musketeer', false, NEAR, 12],
    ['musketeer', true, NEAR, 22],
    ['cannon', false, NEAR, 25],
    ['cannon', true, NEAR, 40],
    ['mortar', false, MORTAR_OK, 45],
  ];
  for (const [tower, upgraded, dist, dealt] of cases) {
    it(`${upgraded ? 'an upgraded' : 'a base'} ${tower} deals ${dealt}, and its hit event says ${dealt}`, () => {
      const s = arena([enemy(0, dist, 'shieldbearer')], tower, upgraded);
      fireTowers(s);
      expect(hits(s)).toEqual([expect.objectContaining({ enemyId: 0, tower, damage: dealt })]);
      expect(s.enemies[0].hp).toBe(120 - dealt);
    });
  }

  it('burn damage is not halved: a Fire Pot burn ticks 5/60 per tick on a Shieldbearer', () => {
    const s = arena([enemy(0, NEAR, 'shieldbearer')], 'firepot');
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 118, burnDps: 5 });
    s.events = [];
    burnEnemies(s);
    expect(s.events).toEqual([{ kind: 'burn', enemyId: 0, damage: 5 / 60 }]);
    expect(s.enemies[0].hp).toBeCloseTo(118 - 5 / 60, 12);
  });

  it('fractional hp: a halved shot that brings hp to 0 kills and pays the 9 gold bounty', () => {
    const s = arena([enemy(0, NEAR, 'shieldbearer', 4.5)], 'longbow', true);
    s.gold = 0;
    fireTowers(s);
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(9);
    expect(s.events.filter((e) => e.kind === 'kill')).toEqual([{ kind: 'kill', enemyId: 0, enemyType: 'shieldbearer', bounty: 9, cause: 'shot' }]);
    expect(KILL_EPSILON).toBe(1e-9);
  });
});
