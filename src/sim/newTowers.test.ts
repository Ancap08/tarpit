// Milestone 10: Longbow, Mortar (minimum range) and Fire Pot (burn, doubled
// on tarred enemies). Numbers from docs/SCOPE-v2.md, written into
// docs/DESIGN.md. Most tests call burnEnemies and fireTowers directly on a
// static arena so enemies do not move; the `in a full tick` block runs tick().
import { describe, expect, it } from 'vitest';
import { MAPS } from './map';
import { buildTower, sellTower, upgradeTower } from './actions';
import { applyBurn, burnEnemies, enemyPosition, findTarget, fireTowers } from './combat';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';
import { cellCenter, type Cell } from './grid';
import { TOWER_DEFS, towerStats } from './towers';
import type { Enemy, EnemyType, GameState, TowerType } from './types';

// P (208,240) and Q (240,240) sit right of the path's first segment, which
// runs along y = 240 from (0,240) to (160,240): an enemy at path distance d
// on it is at (d,240), so its distance from P is exactly 208 - d and from Q
// exactly 240 - d. R (208,272) is a second cell near P that fires after it.
const P: Cell = { col: 6, row: 7 };
const Q: Cell = { col: 7, row: 7 };
const R: Cell = { col: 6, row: 8 };

function enemy(id: number, distance: number, over: Partial<Enemy> = {}, type: EnemyType = 'goblin'): Enemy {
  const fullHp = ({ goblin: 30, wolf: 28, troll: 500, harpy: 40, shieldbearer: 120, boss: 4000, grumblemaw: 5600 } as const)[type];
  return { id, type, hp: fullHp, distance, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...over };
}
const troll = (id: number, distance: number) => enemy(id, distance, {}, 'troll');

/** Mid-wave-1 state with every wave enemy already spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [Cell, TowerType, boolean?][] = []): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [cell, type, upgraded] of towers) {
    expect(buildTower(s, cell, type).ok).toBe(true);
    if (upgraded) expect(upgradeTower(s, cell).ok).toBe(true);
  }
  s.gold = 0;
  return s;
}

/** One combat step without movement: the burn step, then towers. */
function step(s: GameState): void {
  burnEnemies(s);
  fireTowers(s);
}

const hp = (s: GameState) => Object.fromEntries(s.enemies.map((e) => [e.id, e.hp]));

describe('geometry used by these tests', () => {
  it('P, Q and R have the centres the comments assume, and d is (d,240) on the first segment', () => {
    expect([P, Q, R].map(cellCenter)).toEqual([
      { x: 208, y: 240 },
      { x: 240, y: 240 },
      { x: 208, y: 272 },
    ]);
    expect([19, 58, 138, 139].map((d) => enemyPosition(enemy(0, d), MAPS.meadow))).toEqual([
      { x: 19, y: 240 },
      { x: 58, y: 240 },
      { x: 138, y: 240 },
      { x: 139, y: 240 },
    ]);
  });
});

describe('stat tables', () => {
  it('cost, upgrade cost and cooldown ticks (round(60 / fireRate))', () => {
    const row = (t: TowerType) => {
      const d = TOWER_DEFS[t];
      return [d.cost, d.upgradeCost, Math.round(60 / d.base.fireRate), Math.round(60 / d.upgraded.fireRate)];
    };
    expect(row('longbow')).toEqual([40, 30, 24, 24]);
    expect(row('mortar')).toEqual([110, 80, 180, 180]);
    expect(row('firepot')).toEqual([70, 50, 75, 75]);
  });

  it('upgraded stats', () => {
    expect(towerStats({ type: 'longbow', upgraded: true })).toMatchObject({ damage: 9, range: 170 });
    expect(towerStats({ type: 'mortar', upgraded: true })).toMatchObject({ damage: 70, splashRadius: 70, range: 220, minRange: 70 });
    expect(towerStats({ type: 'firepot', upgraded: true })).toMatchObject({ damage: 4, range: 100, burnDps: 8, burnDuration: 4 });
  });

  it('the v1 towers have no minimum range and no burn', () => {
    for (const t of ['musketeer', 'cannon', 'tarpit'] as const) {
      for (const lvl of [TOWER_DEFS[t].base, TOWER_DEFS[t].upgraded]) {
        expect(lvl).toMatchObject({ minRange: 0, burnDps: 0, burnDuration: 0 });
      }
    }
  });
});

describe('longbow', () => {
  it('4 damage every 24 ticks: a goblin (30 hp) dies on the 8th hit, at step 168, for its bounty', () => {
    const s = arena([enemy(0, 138)], [[P, 'longbow']]);
    step(s);
    expect(hp(s)).toEqual({ 0: 26 });
    expect(s.towers[0].cooldownTicks).toBe(24);
    expect(s.shots).toEqual([{ cell: P, tower: 'longbow', targetId: 0, from: { x: 208, y: 240 }, to: { x: 138, y: 240 } }]);
    for (let i = 1; i < 24; i++) step(s);
    expect(hp(s)).toEqual({ 0: 26 });
    step(s); // step 24
    expect(hp(s)).toEqual({ 0: 22 });
    for (let i = 25; i < 168; i++) step(s);
    expect(hp(s)).toEqual({ 0: 2 });
    step(s); // step 168: eighth hit
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(ENEMY_STATS.goblin.bounty);
  });

  it('range 150 inclusive; upgraded 9 damage and range 170 inclusive', () => {
    // d = 58 is 150 px from P, 57 is 151; d = 38 is 170 px, 37 is 171.
    const base = arena([enemy(0, 58)], [[P, 'longbow']]);
    expect(findTarget(base, base.towers[0])?.id).toBe(0);
    const beyond = arena([enemy(0, 57)], [[P, 'longbow']]);
    expect(findTarget(beyond, beyond.towers[0])).toBeUndefined();
    const up = arena([enemy(0, 38)], [[P, 'longbow', true]]);
    fireTowers(up);
    expect(hp(up)).toEqual({ 0: 21 });
    const far = arena([enemy(0, 37)], [[P, 'longbow', true]]);
    expect(findTarget(far, far.towers[0])).toBeUndefined();
  });
});

describe('mortar minimum range', () => {
  it('refuses a target at 69 px and accepts one at 70 px', () => {
    const close = arena([enemy(0, 139)], [[P, 'mortar']]);
    expect(findTarget(close, close.towers[0])).toBeUndefined();
    fireTowers(close);
    expect(hp(close)).toEqual({ 0: 30 });
    expect(close.towers[0].cooldownTicks).toBe(0);
    expect(close.shots).toEqual([]);
    const ok = arena([enemy(0, 138)], [[P, 'mortar']]);
    expect(findTarget(ok, ok.towers[0])?.id).toBe(0);
  });

  it('skips a further-along enemy inside the minimum range for one at 70 px', () => {
    const s = arena([enemy(0, 138), enemy(1, 139)], [[P, 'mortar']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(0);
  });

  it('accepts a target at 220 px and hits nothing at 221 px', () => {
    // From Q: d = 20 is 220 px, d = 19 is 221 px.
    const edge = arena([troll(0, 20)], [[Q, 'mortar']]);
    expect(findTarget(edge, edge.towers[0])?.id).toBe(0);
    fireTowers(edge);
    expect(hp(edge)).toEqual({ 0: 455 });
    expect(edge.towers[0].cooldownTicks).toBe(180);
    const out = arena([troll(0, 19)], [[Q, 'mortar']]);
    fireTowers(out);
    expect(hp(out)).toEqual({ 0: 500 });
    expect(out.shots).toEqual([]);
  });
});

describe('mortar splash', () => {
  it('45 damage to every enemy within 60 px of the target, inclusive, including one inside the minimum range', () => {
    // Target 138 (70 px from P). 150 is 58 px from P (inside the minimum
    // range) and 12 px from the target. 78 is exactly 60 px from the target;
    // 77 is 61 px.
    const s = arena([troll(0, 77), troll(1, 78), troll(2, 138), enemy(3, 150)], [[P, 'mortar']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(2);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 500, 1: 455, 2: 455 });
    expect(s.gold).toBe(ENEMY_STATS.goblin.bounty); // the goblin at 150 died to the splash
    expect(s.shots).toEqual([
      { cell: P, tower: 'mortar', targetId: 2, from: { x: 208, y: 240 }, to: { x: 138, y: 240 }, splashRadius: 60 },
    ]);
  });

  it('upgraded: 70 damage, splash 70 px', () => {
    // 68 is exactly 70 px from the target at 138; 67 is 71 px.
    const s = arena([troll(0, 67), troll(1, 68), troll(2, 138)], [[P, 'mortar', true]]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 500, 1: 430, 2: 430 });
    expect(s.shots[0].splashRadius).toBe(70);
  });

  it('fires every 180 ticks', () => {
    const s = arena([troll(0, 138)], [[P, 'mortar']]);
    for (let i = 0; i < 180; i++) step(s);
    expect(hp(s)).toEqual({ 0: 455 });
    step(s); // step 180
    expect(hp(s)).toEqual({ 0: 410 });
  });
});

describe('fire pot', () => {
  it('4 impact damage, then a 5/s burn for 180 ticks: 5/60 hp per tick', () => {
    const s = arena([enemy(0, 138)], [[P, 'firepot']]);
    step(s);
    expect(s.enemies[0]).toMatchObject({ hp: 26, burnDps: 5, burnTicksLeft: 180 });
    expect(s.shots).toEqual([{ cell: P, tower: 'firepot', targetId: 0, from: { x: 208, y: 240 }, to: { x: 138, y: 240 } }]);
    step(s);
    expect(s.enemies[0].hp).toBeCloseTo(26 - 5 / 60, 12);
    expect(s.enemies[0].burnTicksLeft).toBe(179);
  });

  it('range 100 inclusive', () => {
    // d = 108 is 100 px from P; 107 is 101 px.
    const edge = arena([enemy(0, 108)], [[P, 'firepot']]);
    expect(findTarget(edge, edge.towers[0])?.id).toBe(0);
    const s = arena([enemy(0, 107)], [[P, 'firepot']]);
    expect(findTarget(s, s.towers[0])).toBeUndefined();
  });

  it('a lone burn does 15 damage over 180 ticks, then stops', () => {
    const s = arena([enemy(0, 0)]);
    applyBurn(s.enemies[0], 5, 180);
    for (let i = 0; i < 180; i++) burnEnemies(s);
    expect(s.enemies[0].hp).toBeCloseTo(15, 9);
    expect(s.enemies[0]).toMatchObject({ burnDps: 0, burnTicksLeft: 0 });
    const before = s.enemies[0].hp;
    burnEnemies(s);
    expect(s.enemies[0].hp).toBe(before);
  });

  it('kills a goblin (30 hp, no tar) at step 216', () => {
    // Impacts at steps 0, 75 and 150 (12 damage); the burn is refreshed by
    // each and does 5/60 per step from step 1. 30 - 12 - 216 * 5/60 = 0, so
    // the goblin dies on the burn tick of step 216, before the 4th impact.
    const s = arena([enemy(0, 138)], [[P, 'firepot']]);
    let steps = 0;
    for (; steps < 1000 && s.enemies.length > 0; steps++) step(s);
    expect(steps - 1).toBe(216);
    expect(s.gold).toBe(ENEMY_STATS.goblin.bounty);
  });

  it('burn damage doubles on a tarred enemy: the goblin dies at step 132', () => {
    // 10/60 per step while slowTicksLeft > 0. Impacts at 0 and 75 (8 damage);
    // 30 - 8 - 132 * 10/60 = 0.
    const s = arena([enemy(0, 138, { slow: 0.4, slowTicksLeft: 100_000 })], [[P, 'firepot']]);
    step(s);
    step(s);
    expect(s.enemies[0].hp).toBeCloseTo(26 - 10 / 60, 12);
    let steps = 2;
    for (; steps < 1000 && s.enemies.length > 0; steps++) step(s);
    expect(steps - 1).toBe(132);
  });

  it('upgraded: an 8/s burn for 240 ticks', () => {
    const s = arena([enemy(0, 138)], [[P, 'firepot', true]]);
    step(s);
    expect(s.enemies[0]).toMatchObject({ hp: 26, burnDps: 8, burnTicksLeft: 240 });
    step(s);
    expect(s.enemies[0].hp).toBeCloseTo(26 - 8 / 60, 12);
  });

  it('an impact kill applies no burn and pays the bounty once', () => {
    const s = arena([enemy(0, 138, { hp: 4 })], [[P, 'firepot']]);
    step(s);
    expect(s.enemies).toEqual([]);
    expect(s.gold).toBe(ENEMY_STATS.goblin.bounty);
    const t = arena([enemy(0, 138, { hp: 5 })], [[P, 'firepot']]);
    step(t);
    expect(t.enemies[0]).toMatchObject({ hp: 1, burnDps: 5, burnTicksLeft: 180 });
  });
});

describe('burns do not stack', () => {
  it('a stronger burn replaces a weaker one, strength and duration', () => {
    const e = enemy(0, 0);
    applyBurn(e, 5, 180);
    e.burnTicksLeft = 50;
    applyBurn(e, 8, 240);
    expect(e).toMatchObject({ burnDps: 8, burnTicksLeft: 240 });
  });

  it('an equal burn refreshes the duration', () => {
    const e = enemy(0, 0);
    applyBurn(e, 5, 180);
    e.burnTicksLeft = 10;
    applyBurn(e, 5, 180);
    expect(e).toMatchObject({ burnDps: 5, burnTicksLeft: 180 });
  });

  it('a weaker burn neither replaces nor refreshes a stronger active one', () => {
    const e = enemy(0, 0);
    applyBurn(e, 8, 240);
    e.burnTicksLeft = 50;
    applyBurn(e, 5, 180);
    expect(e).toMatchObject({ burnDps: 8, burnTicksLeft: 50 });
  });

  it('a weaker burn applies once the stronger one has run out', () => {
    const s = arena([enemy(0, 0)]);
    applyBurn(s.enemies[0], 8, 1);
    burnEnemies(s);
    expect(s.enemies[0]).toMatchObject({ burnDps: 0, burnTicksLeft: 0 });
    applyBurn(s.enemies[0], 5, 180);
    expect(s.enemies[0]).toMatchObject({ burnDps: 5, burnTicksLeft: 180 });
  });

  it('an upgraded fire pot burn is kept when a base fire pot hits the same enemy after it', () => {
    // P (upgraded) fires before R (base); 138 is 70 px from P and 77 px from R.
    const s = arena([troll(0, 138)], [
      [R, 'firepot'],
      [P, 'firepot', true],
    ]);
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 492, burnDps: 8, burnTicksLeft: 240 });
  });

  it('two burning ticks never stack damage: one burn, one damage per tick', () => {
    const s = arena([troll(0, 138)], [
      [P, 'firepot'],
      [R, 'firepot'],
    ]);
    step(s); // both hit: 8 impact, one 5/s burn
    step(s);
    expect(s.enemies[0].hp).toBeCloseTo(492 - 5 / 60, 12);
  });
});

describe('burn in a full tick', () => {
  it('runs after movement and before combat; a burn death pays its bounty once and a tower never shoots it', () => {
    // The goblin moves 137 -> 138, burns 5/60 and dies, so the Musketeer at P
    // (in range) never fires. Then the wave is clear: 2 bounty (4 before milestone 25c) + 25 bonus.
    const s = arena([enemy(0, 137, { hp: 0.05, burnDps: 5, burnTicksLeft: 10 })], [[P, 'musketeer']]);
    tick(s);
    expect(s.enemies).toEqual([]);
    expect(s.shots).toEqual([]);
    expect(s.towers[0].cooldownTicks).toBe(0);
    expect(s).toMatchObject({ phase: 'setup', gold: 27, lives: 20 });
  });

  it('tar doubling reads slowTicksLeft after movement counted it down', () => {
    // slowTicksLeft 1 reaches 0 in the move step, so the burn is not doubled;
    // slowTicksLeft 2 leaves 1, so it is.
    const s = arena([enemy(0, 0, { slow: 0.4, slowTicksLeft: 1, burnDps: 6, burnTicksLeft: 10 }), enemy(1, 0, { slow: 0.4, slowTicksLeft: 2, burnDps: 6, burnTicksLeft: 10 })]);
    tick(s);
    expect(s.enemies[0].hp).toBeCloseTo(29.9, 12);
    expect(s.enemies[1].hp).toBeCloseTo(29.8, 12);
  });

  it('a burn applied by a tower first does damage on the next tick', () => {
    const s = arena([enemy(0, 137)], [[P, 'firepot']]);
    tick(s);
    expect(s.enemies[0]).toMatchObject({ hp: 26, burnTicksLeft: 180 });
    tick(s);
    expect(s.enemies[0].hp).toBeCloseTo(26 - 5 / 60, 12);
  });

  it('newly spawned enemies start with no burn', () => {
    const s = createGame();
    s.phase = 'wave';
    s.wave = 1;
    s.spawnedPerGroup = [0];
    tick(s);
    expect(s.enemies[0]).toMatchObject({ burnDps: 0, burnTicksLeft: 0 });
  });
});

describe('build, upgrade and sell', () => {
  const cases: [TowerType, number, number, number][] = [
    ['longbow', 40, 30, 49],
    ['mortar', 110, 80, 133],
    ['firepot', 70, 50, 84],
  ];
  for (const [type, cost, upgradeCost, refund] of cases) {
    it(`${type}: costs ${cost}, upgrade ${upgradeCost}, sells for ${refund} after upgrading`, () => {
      const s = createGame();
      s.gold = cost - 1;
      expect(buildTower(s, P, type)).toEqual({ ok: false, reason: 'not-enough-gold' });
      s.gold = cost;
      expect(buildTower(s, P, type)).toMatchObject({ ok: true, gold: 0 });
      expect(buildTower(s, P, type)).toEqual({ ok: false, reason: 'cell-occupied' });
      expect(buildTower(s, { col: 0, row: 7 }, type)).toEqual({ ok: false, reason: 'not-buildable' });
      s.gold = upgradeCost - 1;
      expect(upgradeTower(s, P)).toEqual({ ok: false, reason: 'not-enough-gold' });
      s.gold = upgradeCost;
      expect(upgradeTower(s, P)).toMatchObject({ ok: true, gold: 0, tower: { type, upgraded: true, spent: cost + upgradeCost } });
      expect(upgradeTower(s, P)).toEqual({ ok: false, reason: 'already-upgraded' });
      startWave(s); // locks it (milestone 25a): 70%
      expect(sellTower(s, P)).toEqual({ ok: true, refund, gold: refund });
      expect(s.towers).toEqual([]);
    });
  }

  it('base sell refunds: 28, 77, 49', () => {
    const refunds = (['longbow', 'mortar', 'firepot'] as const).map((type) => {
      const s = createGame();
      s.gold = 1000;
      buildTower(s, P, type);
      startWave(s); // locks it (milestone 25a): 70%
      return (sellTower(s, P) as { refund: number }).refund;
    });
    expect(refunds).toEqual([28, 77, 49]);
  });

  it('refused once the game is over', () => {
    const s = createGame();
    s.gold = 1000;
    s.phase = 'lost';
    expect(buildTower(s, P, 'mortar')).toEqual({ ok: false, reason: 'game-over' });
  });
});
