import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { applySlow, enemyPosition, findTarget, fireTowers } from './combat';
import { createGame, startWave, tick } from './game';
import type { Enemy, EnemyType, GameState, TowerType } from './types';

function enemy(id: number, distance: number, type: EnemyType = 'goblin', hp?: number): Enemy {
  const fullHp = { goblin: 30, wolf: 28, troll: 500 }[type];
  return { id, type, hp: hp ?? fullHp, distance, slow: 0, slowTicksLeft: 0 };
}

/** Mid-wave-1 state with every wave enemy already spawned, so ticks spawn nothing. */
function arena(enemies: Enemy[], towers: [number, TowerType, boolean?][] = []): GameState {
  const s = createGame();
  s.gold = 10_000;
  s.phase = 'wave';
  s.wave = 1;
  s.spawnedPerGroup = [8];
  s.enemies = enemies;
  s.nextEnemyId = 100;
  for (const [spotId, type, upgraded] of towers) {
    buildTower(s, spotId, type);
    if (upgraded) upgradeTower(s, spotId);
  }
  s.gold = 0;
  return s;
}

const hp = (s: GameState) => Object.fromEntries(s.enemies.map((e) => [e.id, e.hp]));

describe('geometry used by these tests', () => {
  it('spot 0 (96,160) is exactly 80 px from path distances 96, 192 and 288', () => {
    expect([96, 192, 288].map((d) => enemyPosition(enemy(0, d)))).toEqual([
      { x: 96, y: 240 },
      { x: 160, y: 208 },
      { x: 160, y: 112 },
    ]);
  });
});

describe('targeting', () => {
  it('picks the enemy furthest along the path within range', () => {
    // Musketeer at spot 0, range 110: distance 400 (256,96) is out of range.
    const s = arena([enemy(0, 50), enemy(1, 200), enemy(2, 400)], [[0, 'musketeer']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(1);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 18, 2: 30 });
  });

  it('breaks distance ties by lower id', () => {
    const s = arena([enemy(5, 150), enemy(3, 150), enemy(4, 100)], [[0, 'musketeer']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(3);
  });

  it('ignores everything out of range', () => {
    const s = arena([enemy(0, 0), enemy(1, 500)], [[0, 'musketeer']]);
    expect(findTarget(s, s.towers[0])).toBeUndefined();
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 30 });
    expect(s.towers[0].cooldownTicks).toBe(0);
  });

  it('range is inclusive: a tar pit (90) at spot 0 hits an enemy exactly 90 px away but not one 90.004 px away', () => {
    // On the first segment, (x,240) is 80 px below spot 0, so 90 px needs
    // 96 - x = sqrt(1700). This distance gives exactly 90 in floating point.
    const exact = 54.76894374382339;
    const p = enemyPosition(enemy(0, exact));
    expect(Math.hypot(p.x - 96, p.y - 160)).toBe(90);
    const s = arena([enemy(0, exact), enemy(1, 54.76)], [[0, 'tarpit']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(0);
    const t = arena([enemy(1, 54.76), enemy(2, 400)], [[0, 'tarpit']]);
    expect(findTarget(t, t.towers[0])).toBeUndefined();
  });

  it('an enemy killed by an earlier tower is not targeted by a later one in the same tick', () => {
    // Spot 0 musketeer kills enemy 0 (12 hp) at 200; spot 2 musketeer reaches
    // both 200 and 170 = (160,230), and so shoots enemy 1 instead.
    const s = arena([enemy(0, 200, 'goblin', 12), enemy(1, 170)], [
      [0, 'musketeer'],
      [2, 'musketeer'],
    ]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 1: 18 });
    expect(s.gold).toBe(4);
    expect(s.towers.map((t) => t.cooldownTicks)).toEqual([60, 60]);
  });
});

describe('musketeer', () => {
  it('fires once, waits 60 ticks, and kills a goblin on the third 12-damage hit for 4 gold', () => {
    const s = createGame();
    buildTower(s, 0, 'musketeer'); // gold 50
    startWave(s);
    // Goblin 0 spawns on waveTick 0 at (0,240), 125 px away; it first comes
    // within 110 px at distance 21 (waveTick 21).
    for (let i = 0; i < 21; i++) tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 30, distance: 20 });
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 18, distance: 21 });
    expect(s.towers[0].cooldownTicks).toBe(60);
    for (let i = 0; i < 59; i++) tick(s);
    expect(s.enemies[0].hp).toBe(18);
    expect(s.towers[0].cooldownTicks).toBe(1);
    tick(s); // waveTick 81
    expect(s.enemies[0].hp).toBe(6);
    expect(s.gold).toBe(50);
    for (let i = 0; i < 59; i++) tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 6 });
    tick(s); // waveTick 141: third hit
    expect(s.enemies.map((e) => e.id)).toEqual([1, 2]);
    expect(s.gold).toBe(54);
  });

  it('upgraded: 22 damage and range 125', () => {
    // Distance 0 is (0,240), 124.9 px from spot 0: out of base range, in upgraded range.
    const s = arena([enemy(0, 0)], [[0, 'musketeer', true]]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 8 });
    const base = arena([enemy(0, 0)], [[0, 'musketeer']]);
    expect(findTarget(base, base.towers[0])).toBeUndefined();
  });
});

describe('cannon splash', () => {
  // Cannon at spot 2 (240,176), range 90. Target: distance 400 = (256,96).
  // Distance 370 = (226,96) is 30 px from it; 440 = (296,96) is exactly 40 px
  // (and itself out of the cannon's range); 350 = (206,96) is 50 px; 341 is 59 px.
  it('hits every enemy within 40 px of the target, inclusive, and not one outside', () => {
    const s = arena([enemy(0, 341), enemy(1, 370), enemy(2, 400), enemy(3, 440), enemy(4, 350)], [[2, 'cannon']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(2);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 5, 2: 5, 3: 5, 4: 30 });
    expect(s.towers[0].cooldownTicks).toBe(120);
  });

  it('kills every enemy the splash drops to 0 and pays each bounty', () => {
    const s = arena([enemy(0, 370, 'wolf', 25), enemy(1, 400, 'goblin', 25), enemy(2, 440, 'troll')], [[2, 'cannon']]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 2: 475 });
    expect(s.gold).toBe(9); // wolf 5 + goblin 4
  });

  it('upgraded: 40 damage and splash radius 55', () => {
    // Distance 345 = (201,96) is exactly 55 px from the target; 344 is 56 px.
    const s = arena([enemy(0, 344), enemy(2, 400, 'troll'), enemy(4, 345, 'troll')], [[2, 'cannon', true]]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 2: 460, 4: 460 });
  });
});

describe('tar pit slow', () => {
  it('deals 3 damage, slows 40% for 120 ticks: a goblin moves 0.6 px/tick', () => {
    const s = arena([enemy(0, 191)], [[0, 'tarpit']]);
    tick(s); // goblin moves to 192 (80 px from spot 0), then is hit
    expect(s.enemies[0]).toMatchObject({ hp: 27, distance: 192, slow: 0.4, slowTicksLeft: 120 });
    tick(s);
    expect(s.enemies[0].distance - 192).toBeCloseTo(0.6, 12);
    expect(s.enemies[0].slowTicksLeft).toBe(119);
  });

  it('upgraded: 60% slow and range 105', () => {
    // Distance 165 = (160,235): 64 px across, 75 down -> 98.6 px, beyond 90.
    const base = arena([enemy(0, 165)], [[0, 'tarpit']]);
    expect(findTarget(base, base.towers[0])).toBeUndefined();
    const s = arena([enemy(0, 165)], [[0, 'tarpit', true]]);
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 27, slow: 0.6, slowTicksLeft: 120 });
  });

  it('a stronger slow replaces a weaker one', () => {
    const e = enemy(0, 0);
    applySlow(e, 0.4, 120);
    e.slowTicksLeft = 50;
    applySlow(e, 0.55, 120);
    expect(e).toMatchObject({ slow: 0.55, slowTicksLeft: 120 });
  });

  it('a weaker slow does not replace or refresh a stronger active one', () => {
    const e = enemy(0, 0);
    applySlow(e, 0.55, 120);
    e.slowTicksLeft = 50;
    applySlow(e, 0.4, 120);
    expect(e).toMatchObject({ slow: 0.55, slowTicksLeft: 50 });
  });

  it('an equal slow refreshes the duration', () => {
    const e = enemy(0, 0);
    applySlow(e, 0.4, 120);
    e.slowTicksLeft = 10;
    applySlow(e, 0.4, 120);
    expect(e).toMatchObject({ slow: 0.4, slowTicksLeft: 120 });
  });

  it('a base tar pit does not weaken an upgraded tar pit slow on the same enemy', () => {
    // Spot 0 (upgraded, 60%) acts before spot 2 (base, 40%, range 90).
    // Distance 224 = (160,176) is 80 px from spot 2 and 66 px from spot 0.
    expect(enemyPosition(enemy(0, 224))).toEqual({ x: 160, y: 176 });
    const s = arena([enemy(0, 224, 'troll')], [
      [0, 'tarpit', true],
      [2, 'tarpit'],
    ]);
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 494, slow: 0.6, slowTicksLeft: 120 });
  });
});

describe('kills', () => {
  it('a dead enemy is removed in the same tick, pays its bounty, and never costs a life', () => {
    const s = arena([enemy(0, 99, 'goblin', 12)], [[0, 'musketeer']]);
    tick(s);
    expect(s.enemies).toEqual([]);
    // 4 bounty, then the wave is clear (all spawned, none alive): 25 bonus.
    expect(s).toMatchObject({ phase: 'setup', gold: 29, lives: 20 });
  });

  it('a newly spawned enemy is not shot on its spawn tick', () => {
    // Upgraded musketeer at spot 0 reaches distance 0.
    const s = createGame();
    buildTower(s, 0, 'musketeer');
    upgradeTower(s, 0);
    startWave(s);
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 30, distance: 0 });
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 8, distance: 1 });
  });
});
