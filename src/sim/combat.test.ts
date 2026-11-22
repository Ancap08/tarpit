import { describe, expect, it } from 'vitest';
import { MAPS } from './map';
import { buildTower, upgradeTower } from './actions';
import { applySlow, enemyPosition, findTarget, fireTowers } from './combat';
import { ENEMY_STATS } from './enemies';
import { createGame, startWave, tick } from './game';
import { cellCenter, type Cell } from './grid';
import type { Enemy, EnemyType, GameState, TowerType } from './types';

// Cells used below. A is the legacy cell for v1 spot 0; B is v1 spot 2's
// exact position; U sits exactly 125 px from the spawn.
const A: Cell = { col: 2, row: 5 }; // centre (80,176)
const B: Cell = { col: 7, row: 5 }; // centre (240,176)
const U: Cell = { col: 2, row: 4 }; // centre (80,144)

function enemy(id: number, distance: number, type: EnemyType = 'goblin', hp?: number): Enemy {
  const fullHp = ({ goblin: 30, wolf: 28, troll: 500, harpy: 40, shieldbearer: 120, boss: 4000 } as const)[type];
  return { id, type, hp: hp ?? fullHp, distance, slow: 0, slowTicksLeft: 0 };
}

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
    if (upgraded) upgradeTower(s, cell);
  }
  s.gold = 0;
  return s;
}

const hp = (s: GameState) => Object.fromEntries(s.enemies.map((e) => [e.id, e.hp]));

describe('geometry used by these tests', () => {
  it('cells A, B and U have the centres the comments assume', () => {
    expect([A, B, U].map(cellCenter)).toEqual([
      { x: 80, y: 176 },
      { x: 240, y: 176 },
      { x: 80, y: 144 },
    ]);
  });

  it('A (80,176) is 64 px above path distance 80 and 80 px left of path distance 224', () => {
    expect([80, 224].map((d) => enemyPosition(enemy(0, d), MAPS.meadow))).toEqual([
      { x: 80, y: 240 },
      { x: 160, y: 176 },
    ]);
  });
});

describe('targeting', () => {
  it('picks the enemy furthest along the path within range', () => {
    // Musketeer at A, range 110: 50 (50,240) is 70.7 px away, 200 (160,200)
    // is 83.5 px, 400 (256,96) is 193 px and out of range.
    const s = arena([enemy(0, 50), enemy(1, 200), enemy(2, 400)], [[A, 'musketeer']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(1);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 18, 2: 30 });
  });

  it('breaks distance ties by lower id', () => {
    const s = arena([enemy(5, 150), enemy(3, 150), enemy(4, 100)], [[A, 'musketeer']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(3);
  });

  it('ignores everything out of range', () => {
    // 500 = (356,96) and 600 = (420,132) are far from A.
    const s = arena([enemy(0, 500), enemy(1, 600)], [[A, 'musketeer']]);
    expect(findTarget(s, s.towers[0])).toBeUndefined();
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 30 });
    expect(s.towers[0].cooldownTicks).toBe(0);
  });

  it('range is inclusive: a tar pit (90) at A hits an enemy exactly 90 px away but not one 90.004 px away', () => {
    // On the x = 160 segment, (160,y) is 80 px right of A, so 90 px needs
    // y - 176 = sqrt(1700), at path distance 160 + 64 - sqrt(1700). This
    // distance gives exactly 90 in floating point.
    const exact = 182.7689437438234;
    const p = enemyPosition(enemy(0, exact), MAPS.meadow);
    expect(Math.hypot(p.x - 80, p.y - 176)).toBe(90);
    const s = arena([enemy(0, exact), enemy(1, 182.76)], [[A, 'tarpit']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(0);
    const t = arena([enemy(1, 182.76), enemy(2, 400)], [[A, 'tarpit']]);
    expect(findTarget(t, t.towers[0])).toBeUndefined();
  });

  it('an enemy killed by an earlier tower is not targeted by a later one in the same tick', () => {
    // A fires first (cellKey 152 before 157). Its musketeer kills enemy 0
    // (12 hp) at 200; B's musketeer reaches both 200 and 170 = (160,230), and
    // so shoots enemy 1 instead.
    const s = arena([enemy(0, 200, 'goblin', 12), enemy(1, 170)], [
      [B, 'musketeer'],
      [A, 'musketeer'],
    ]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 1: 18 });
    expect(s.gold).toBe(ENEMY_STATS.goblin.bounty);
    expect(s.towers.map((t) => t.cooldownTicks)).toEqual([60, 60]);
  });
});

describe('musketeer', () => {
  it('fires once, waits 60 ticks, and kills a goblin on the third 12-damage hit for its bounty', () => {
    const s = createGame();
    buildTower(s, A, 'musketeer'); // gold 50
    startWave(s);
    // Goblin 0 spawns on waveTick 0 at (0,240), 102.4 px from A: already in
    // range, but a new enemy is not shot on its spawn tick.
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 23, distance: 0 });
    // A Goblin spawns with 23 hp (milestone 28); give this one 30 so the
    // cooldown shows across three hits, as before.
    s.enemies[0].hp = 30;
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 18, distance: 1 });
    expect(s.towers[0].cooldownTicks).toBe(60);
    for (let i = 0; i < 59; i++) tick(s);
    expect(s.enemies[0].hp).toBe(18);
    expect(s.towers[0].cooldownTicks).toBe(1);
    tick(s); // waveTick 61; goblin 1 (spawned at 150) is not out yet
    expect(s.enemies[0].hp).toBe(6);
    expect(s.gold).toBe(50);
    for (let i = 0; i < 59; i++) tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 6 });
    tick(s); // waveTick 121: third hit at (121,240), 76 px from A
    // Goblin 1 spawns at waveTick 150 (milestone 28; 72 before), so none is left.
    expect(s.enemies.map((e) => e.id)).toEqual([]);
    expect(s.gold).toBe(50 + ENEMY_STATS.goblin.bounty);
  });

  it('upgraded: 22 damage and range 125, inclusive', () => {
    // Distance 0 is (0,240), exactly 125 px from U (80,144): out of base range, in upgraded range.
    const s = arena([enemy(0, 0)], [[U, 'musketeer', true]]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 8 });
    const base = arena([enemy(0, 0)], [[U, 'musketeer']]);
    expect(findTarget(base, base.towers[0])).toBeUndefined();
  });
});

describe('cannon splash', () => {
  // Cannon at B (240,176), range 105 (milestone 30). Target: distance 430 =
  // (286,96), 92.3 px from B. Distance 400 = (256,96) is 30 px from it; 470 =
  // (326,96) is exactly 40 px (and itself out of the cannon's range, 117.6
  // px); 380 = (236,96) is 50 px; 371 is 59 px.
  it('hits every enemy within 40 px of the target, inclusive, and not one outside', () => {
    const s = arena([enemy(0, 371), enemy(1, 400), enemy(2, 430), enemy(3, 470), enemy(4, 380)], [[B, 'cannon']]);
    expect(findTarget(s, s.towers[0])?.id).toBe(2);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 1: 5, 2: 5, 3: 5, 4: 30 });
    expect(s.towers[0].cooldownTicks).toBe(120);
  });

  it('kills every enemy the splash drops to 0 and pays each bounty', () => {
    const s = arena([enemy(0, 400, 'wolf', 25), enemy(1, 430, 'goblin', 25), enemy(2, 470, 'troll')], [[B, 'cannon']]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 2: 475 });
    expect(s.gold).toBe(ENEMY_STATS.wolf.bounty + ENEMY_STATS.goblin.bounty); // 2 + 2 since milestone 25c (5 + 4 before)
  });

  it('upgraded: 40 damage and splash radius 55', () => {
    // Distance 345 = (201,96) is exactly 55 px from the target; 344 is 56 px.
    const s = arena([enemy(0, 344), enemy(2, 400, 'troll'), enemy(4, 345, 'troll')], [[B, 'cannon', true]]);
    fireTowers(s);
    expect(hp(s)).toEqual({ 0: 30, 2: 460, 4: 460 });
  });
});

describe('tar pit slow', () => {
  it('deals 3 damage, slows 40% for 120 ticks: a goblin moves 0.6 px/tick', () => {
    const s = arena([enemy(0, 191)], [[A, 'tarpit']]);
    tick(s); // goblin moves to 192 = (160,208), 86.2 px from A, then is hit
    expect(s.enemies[0]).toMatchObject({ hp: 27, distance: 192, slow: 0.4, slowTicksLeft: 120 });
    tick(s);
    expect(s.enemies[0].distance - 192).toBeCloseTo(0.6, 12);
    expect(s.enemies[0].slowTicksLeft).toBe(119);
  });

  it('upgraded: 60% slow and range 105', () => {
    // Distance 165 = (160,235): 80 px across, 59 down from A -> 99.4 px, beyond 90.
    const base = arena([enemy(0, 165)], [[A, 'tarpit']]);
    expect(findTarget(base, base.towers[0])).toBeUndefined();
    const s = arena([enemy(0, 165)], [[A, 'tarpit', true]]);
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
    // A (upgraded, 60%) acts before B (base, 40%, range 90).
    // Distance 224 = (160,176) is 80 px from both.
    expect(enemyPosition(enemy(0, 224), MAPS.meadow)).toEqual({ x: 160, y: 176 });
    const s = arena([enemy(0, 224, 'troll')], [
      [A, 'tarpit', true],
      [B, 'tarpit'],
    ]);
    fireTowers(s);
    expect(s.enemies[0]).toMatchObject({ hp: 494, slow: 0.6, slowTicksLeft: 120 });
  });
});

describe('kills', () => {
  it('a dead enemy is removed in the same tick, pays its bounty, and never costs a life', () => {
    const s = arena([enemy(0, 99, 'goblin', 12)], [[A, 'musketeer']]);
    tick(s);
    expect(s.enemies).toEqual([]);
    // 2 bounty (4 before milestone 25c), then the wave is clear (all spawned, none alive): 25 bonus.
    expect(s).toMatchObject({ phase: 'setup', gold: 27, lives: 20 });
  });

  it('a newly spawned enemy is not shot on its spawn tick', () => {
    // Upgraded musketeer at U reaches distance 0 (exactly 125 px).
    const s = createGame();
    buildTower(s, U, 'musketeer');
    upgradeTower(s, U);
    startWave(s);
    tick(s);
    expect(s.enemies[0]).toMatchObject({ id: 0, hp: 23, distance: 0 });
    expect(s.shots).toEqual([]);
    tick(s);
    // The next tick it is shot (22 of its 23 hp, milestone 28).
    expect(s.shots.map((x) => x.targetId)).toEqual([0]);
    expect(s.enemies.map((e) => [e.id, e.hp])).toEqual([[0, 1]]);
  });
});
