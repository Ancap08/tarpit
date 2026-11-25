import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower, useSpecial } from './actions';
import { burnEnemies, fireTowers } from './combat';
import { ENEMY_STATS, isTarred } from './enemies';
import { FEATHERS } from './feathers';
import { createGame, startWave, tick } from './game';
import { LEVELS } from './levels';
import { moveEnemies } from './movement';
import { TICKS_PER_SECOND } from './time';
import type { Enemy, EnemyType, GameState, MapDef } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const groundTypes = ['goblin', 'wolf', 'troll', 'shieldbearer'] as const;

function enemy(id: number, type: EnemyType, distance: number): Enemy {
  return { id, type, distance, hp: ENEMY_STATS[type].hp, slow: 0, slowTicksLeft: 0 };
}

function arena(enemies: Enemy[], tower = false, col = 6): GameState {
  const state = createGame({ map: LINE });
  if (tower) {
    const cell = { col, row: 5 };
    state.gold = 1000;
    expect(buildTower(state, cell, 'tarpit').ok).toBe(true);
    expect(upgradeTower(state, cell).ok).toBe(true);
    expect(upgradeTower(state, cell, 'B').ok).toBe(true);
  }
  state.wave = 5;
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = waveDef(6).groups.map((g) => g.count);
  state.enemies = enemies;
  return state;
}

function barrel(state: GameState, x: number): void {
  expect(useSpecial(state, 'tarBarrel', { x, y: 240 }).ok).toBe(true);
}

describe('R3: tar and feathers use the trail and end after one run', () => {
  it('a tower tars, then feathers, then targets the next unfeathered walker first', () => {
    const front = enemy(0, 'troll', 220);
    const back = enemy(1, 'goblin', 195);
    const state = arena([front, back], true);
    const tower = state.towers[0];
    fireTowers(state);
    expect(isTarred(front)).toBe(true);
    expect(front.feathered).toBeUndefined();
    tower.cooldownTicks = 0;
    fireTowers(state);
    expect(front.feathered).toBe(true);
    expect(front.runTicksLeft).toBe(FEATHERS.runTicks);
    tower.cooldownTicks = 0;
    fireTowers(state);
    expect(state.shots.at(-1)?.targetId).toBe(back.id);
    expect(isTarred(back)).toBe(true);

    // An impact can tar both again. Only another path B shot feathers the second.
    barrel(state, 210);
    expect(back.feathered).toBeUndefined();
    for (let i = 0; i < 3; i++) {
      tower.cooldownTicks = 0;
      fireTowers(state);
    }
    expect(state.events.filter((event) => event.kind === 'feathered').map((event) => event.enemyId)).toEqual([0, 1]);
    expect(back.runTicksLeft).toBe(FEATHERS.runTicks);
  });

  it('C1: one barrel feathers every eligible enemy through the radius edge, once per life', () => {
    const types = [...groundTypes, 'harpy', 'goblin', 'wolf', 'troll'] as const;
    const crowd = types.map((type, i) => enemy(i, type, 300 + i * 10));
    crowd[0].distance = 200; // Exactly 100 px from the landing point.
    const marked = Object.assign(enemy(8, 'wolf', 290), { feathered: true as const, runTicksLeft: 11 });
    const bosses = [enemy(9, 'boss', 320), enemy(10, 'grumblemaw', 330)];
    const outside = enemy(11, 'harpy', 400.01);
    const state = arena([...crowd, marked, ...bosses, outside]);
    state.level = LEVELS[10];
    barrel(state, 300);
    expect(FEATHERS.barrelRunTicks).toBeGreaterThanOrEqual(60);
    expect(FEATHERS.barrelRunTicks).toBeLessThanOrEqual(FEATHERS.runTicks);
    const events = () => state.events.filter(e => e.kind === 'feathered').map(e => e.enemyId);
    expect(events()).toEqual(crowd.map(e => e.id));
    for (const hit of crowd) {
      expect(isTarred(hit)).toBe(true);
      expect(hit.runTicksLeft).toBe(FEATHERS.barrelRunTicks);
    }
    for (const boss of bosses) {
      expect(boss.specialSlow).toBe(0.3);
      expect(boss.feathered).toBeUndefined();
    }
    expect(isTarred(outside)).toBe(false);
    expect(outside.feathered).toBeUndefined();
    expect(marked.runTicksLeft).toBe(11);

    tick(state);
    const remaining = crowd.map(e => e.runTicksLeft);
    state.specialCharges = 1;
    barrel(state, 300);
    expect(events()).toEqual([]);
    expect(crowd.map(e => e.runTicksLeft)).toEqual(remaining);
  });

  it('a barrel impact tars the whole crowd without starting a retreat', () => {
    const crowd = [...groundTypes, 'harpy', 'boss', 'grumblemaw'] as const;
    const state = arena(crowd.map((type, i) => enemy(i, type, 200 + i)));
    barrel(state, 205);
    expect(state.enemies.every(isTarred)).toBe(true);
    expect(state.enemies.some(e => e.feathered || e.runTicksLeft)).toBe(false);
    expect(state.events.some(e => e.kind === 'feathered')).toBe(false);
  });

  it.each([undefined, ...LEVELS.slice(0, 10)].map(level => ({ name: level?.id ?? 'Free play', level })))(
    'C1 and C9: ordinary tar and 1200-tick refill on $name', ({ level }) => {
      const state = arena(groundTypes.map((type, i) => enemy(i, type, 205 + i)));
      if (level) state.level = level;
      state.cheated = true; // Also exercise the ordinary barrel where only the cheat unlocks it.
      barrel(state, 205);
      expect(state.enemies.every(isTarred)).toBe(true);
      expect(state.enemies.some(e => e.feathered || e.runTicksLeft)).toBe(false);
      expect(state.events.some(e => e.kind === 'feathered')).toBe(false);
      expect(state.specialRechargeTicks).toBe(1200);
      expect(state.barrelRecharge).toBeUndefined();
    },
  );

  it('zone entrants are tarred, and a tower can feather one on its first shot', () => {
    const state = arena([], true);
    barrel(state, 210);
    const walker = enemy(2, 'wolf', 210);
    const flyer = enemy(3, 'harpy', 210);
    state.enemies.push(walker, flyer);
    tick(state);
    expect(isTarred(walker)).toBe(true);
    expect(walker.feathered).toBe(true);
    expect(isTarred(flyer)).toBe(true);
    expect(flyer.feathered).toBeUndefined();
  });

  it.each(groundTypes)(
    'a %s hit at the entrance turns once and completes the wave at the far exit', (type) => {
      const walker = enemy(0, type, ENEMY_STATS[type].speed / TICKS_PER_SECOND / 2);
      const state = arena([walker], true, 0);
      barrel(state, 0);
      expect(walker.feathered).toBeUndefined();
      fireTowers(state);
      expect(walker.feathered).toBe(true);
      tick(state);
      expect([walker.distance, walker.runTicksLeft]).toEqual([0, 0]);
      tick(state);
      expect(walker.distance).toBeGreaterThan(0);
      state.specialCharges = 1;
      barrel(state, 0);
      expect(state.events.filter((event) => event.kind === 'feathered')).toHaveLength(0);
      state.towers[0].cooldownTicks = 0;
      fireTowers(state);
      expect(walker.runTicksLeft).toBe(0);
      state.towers.length = 0; // Let this survivor walk the full trail.
      const lives = state.lives;
      // All zone slows expire after their zone and linger, even on a very short road.
      const bound = state.zones.reduce((ticks, z) => ticks + z.ticksLeft, 0)
        + TICKS_PER_SECOND * (2 + Math.ceil(LINE.width / ENEMY_STATS[type].speed));
      for (let i = 0; i < bound && state.phase === 'wave'; i++) tick(state);
      expect(state.phase).toBe('setup');
      expect(walker.distance).toBeGreaterThanOrEqual(LINE.width);
      expect(state.lives).toBe(lives - 1);
    },
  );

  it.each(['boss', 'grumblemaw'] as const)('%s is tarred but never runs or flinches', (type) => {
    const boss = enemy(0, type, 205);
    const runner = enemy(1, 'goblin', 205.5);
    const state = arena([runner, boss], true);
    barrel(state, 205);
    fireTowers(state);
    expect(runner.feathered).toBe(true);
    state.towers[0].cooldownTicks = 0;
    tick(state); // runner crossed the boss, and the tower shot the tarred boss
    expect(isTarred(boss)).toBe(true);
    expect([boss.feathered, boss.runTicksLeft, boss.flinchTicksLeft]).toEqual([undefined, undefined, undefined]);
    expect(state.shots.at(-1)?.targetId).toBe(boss.id);
    expect(boss.distance).toBeGreaterThan(205);
  });

  it.each([false, true])('crossing halts a walker once, independent of array order (reversed %s)', (reversed) => {
    const runner = enemy(0, 'troll', 205);
    const state = arena([runner], true);
    barrel(state, 205);
    fireTowers(state);
    const step = ENEMY_STATS.troll.speed / TICKS_PER_SECOND;
    const walker = enemy(1, 'wolf', 205 - step - 1); // crosses after both move
    state.enemies.push(walker);
    if (reversed) state.enemies.reverse();
    tick(state);
    expect(walker.flinchTicksLeft).toBe(FEATHERS.flinchTicks);
    const stoppedAt = walker.distance;
    for (let i = 0; i < FEATHERS.flinchTicks; i++) tick(state);
    expect(walker.distance).toBe(stoppedAt);
    expect(walker.flinchTicksLeft).toBe(0);
    const second = enemy(2, 'troll', stoppedAt + step / 2);
    state.enemies.push(second);
    // Another runner passes the same walker after the original flinch ends.
    second.feathered = true;
    second.runTicksLeft = FEATHERS.runTicks;
    tick(state);
    expect(walker.flinchTicksLeft).toBe(0);
    expect(walker.distance).toBeGreaterThan(stoppedAt);
  });

  it('runs through an occupied guard and wall at fixed speed, then resumes normal combat', () => {
    const total = ENEMY_STATS.troll.speed / TICKS_PER_SECOND * FEATHERS.runTicks;
    const start = total + 150;
    const walker = enemy(0, 'troll', start);
    const state = arena([walker], true);
    walker.slow = 0.7;
    walker.slowTicksLeft = FEATHERS.runTicks + 8;
    walker.burnDps = 6;
    walker.burnTicksLeft = FEATHERS.runTicks + 8;
    // Put the wall behind the guard. The returning walker meets the wall first.
    const wall = { kind: 'barricade' as const, x: 150 + 0.1, y: 240, angle: 0, distance: 150 + 0.1, hp: 40, maxHp: 40 };
    const guard = { ...wall, kind: 'guard' as const, id: 0, x: start, distance: start, attackDps: 10, ticksLeft: 300 };
    walker.guardContact = { guardId: guard.id, arrivedWithTicksLeft: 300 };
    state.blockers = [guard, wall];
    barrel(state, start);
    fireTowers(state);
    expect(walker.feathered).toBe(true);
    const beforeBurn = walker.hp;
    for (let i = 0; i < FEATHERS.runTicks; i++) {
      moveEnemies(state.enemies, state.events, state.blockers, 1.5);
      burnEnemies(state);
    }
    expect(walker.distance).toBeCloseTo(150, 8);
    expect(walker.slowTicksLeft).toBe(8);
    expect(walker.burnTicksLeft).toBe(8);
    expect(walker.hp).toBeCloseTo(beforeBurn - 12 * FEATHERS.runTicks / TICKS_PER_SECOND, 8);
    expect(walker.guardContact).toBeUndefined();
    expect(state.events.some((event) => event.kind === 'blockerHit' || event.kind === 'guardStrike')).toBe(false);
    moveEnemies(state.enemies, state.events, state.blockers, 1.5);
    expect(walker.distance).toBe(wall.distance);
    expect(wall.hp).toBeLessThan(wall.maxHp);
    expect(guard.hp).toBe(guard.maxHp);
  });
});

describe('R8: retreat lasts at least a second at the walking pace of each enemy', () => {
  it.each(groundTypes)('%s takes at least 60 backward steps at its own speed', type => {
    const walker = enemy(0, type, 500);
    const state = arena([walker], true, 15);
    barrel(state, 500);
    fireTowers(state);
    expect(walker.feathered).toBe(true);
    const minimumStep = ENEMY_STATS[type].speed / TICKS_PER_SECOND;
    for (let i = 0; i < 60; i++) {
      const before = walker.distance;
      moveEnemies(state.enemies, state.events);
      expect(before - walker.distance + 1e-9, `backward step ${i + 1}`).toBeGreaterThanOrEqual(minimumStep);
    }
  });

  it('a flinch during a retreat preserves the remaining backward steps', () => {
    const walker = enemy(0, 'goblin', 220);
    const state = arena([walker], true);
    barrel(state, 220);
    fireTowers(state);
    walker.flinchTicksLeft = FEATHERS.flinchTicks;
    for (let i = 0; i < FEATHERS.flinchTicks; i++) moveEnemies(state.enemies, state.events);
    expect(walker.distance).toBe(220);
    expect(walker.runTicksLeft).toBe(FEATHERS.runTicks);
  });
});
