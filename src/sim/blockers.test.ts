import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { BARRICADE_HP, barricadePlacement } from './blockers';
import { findTarget } from './combat';
import { ENEMY_STATS } from './enemies';
import type { GameEvent } from './events';
import { callNextWave, continueEndless, createGame, lastSpawnTick, startWave, tick } from './game';
import { MAP_IDS, MAPS, pathLength } from './map';
import { moveEnemies } from './movement';
import type { Blocker, Enemy, EnemyType, GameState, MapDef } from './types';
import { waveDef } from './waves';

const LINE: MapDef = { id: 'line', width: 960, height: 480, path: [{ x: 0, y: 240 }, { x: 960, y: 240 }] };
const WALL = { x: 160, y: 240 };

function enemy(id: number, type: EnemyType, distance = WALL.x, hp = ENEMY_STATS[type].hp): Enemy {
  return { id, type, distance, hp, slow: 0, slowTicksLeft: 0 };
}

/** Use production wave start, then isolate the enemies under test. */
function arena(enemies: Enemy[] = [], wave = 3, difficulty: GameState['difficulty'] = 'normal'): GameState {
  const state = createGame({ map: LINE, difficulty });
  state.wave = wave - 1;
  expect(startWave(state).ok).toBe(true);
  state.spawnedPerGroup = waveDef(wave).groups.map((group) => group.count);
  state.waveTick = lastSpawnTick(wave) + 1;
  state.enemies = enemies;
  state.nextEnemyId = Math.max(-1, ...enemies.map((e) => e.id)) + 1;
  return state;
}

function ticks(state: GameState, count: number): void {
  for (let i = 0; i < count; i++) tick(state);
}

describe('Barricade placement', () => {
  it.each(MAP_IDS)('projects onto every segment and corner of %s', (mapId) => {
    const map = MAPS[mapId];
    let distance = 0;
    for (let i = 1; i < map.path.length; i++) {
      const a = map.path[i - 1];
      const b = map.path[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const midpoint = { x: a.x + dx / 2, y: a.y + dy / 2 };
      for (const side of [-1, 1]) {
        const aim = { x: midpoint.x - side * 10 * dy / length, y: midpoint.y + side * 10 * dx / length };
        expect(barricadePlacement(map, aim)).toEqual({
          ok: true, point: { ...midpoint, angle, distance: distance + length / 2 },
        });
      }
      distance += length;
      if (i < map.path.length - 1) {
        expect(barricadePlacement(map, b)).toEqual({ ok: true, point: { ...b, distance, angle } });
      }
    }
    expect(barricadePlacement(map, map.path[0])).toMatchObject({ ok: false, reason: 'near-spawn' });
    expect(barricadePlacement(map, map.path[map.path.length - 1])).toMatchObject({ ok: false, reason: 'near-exit' });
  });

  it('uses an inclusive 40 px snap and allows exactly 64 px from either end', () => {
    expect(barricadePlacement(LINE, { x: 64, y: 280 })).toEqual({ ok: true, point: { x: 64, y: 240, distance: 64, angle: 0 } });
    expect(barricadePlacement(LINE, { x: 896, y: 200 })).toEqual({ ok: true, point: { x: 896, y: 240, distance: 896, angle: 0 } });
    expect(barricadePlacement(LINE, { x: 64, y: 280.01 })).toMatchObject({ ok: false, reason: 'off-trail' });
    expect(barricadePlacement(LINE, { x: 63.99, y: 240 })).toMatchObject({ ok: false, reason: 'near-spawn' });
    expect(barricadePlacement(LINE, { x: 896.01, y: 240 })).toMatchObject({ ok: false, reason: 'near-exit' });
    expect(barricadePlacement(LINE, { x: -0.01, y: 240 })).toEqual({ ok: false, reason: 'out-of-bounds' });
  });

  it('projects diagonals, skips zero-length segments and prefers the first nonzero segment on a tie', () => {
    const map = { ...LINE, path: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 120, y: 120 }, { x: 240, y: 0 }] };
    expect(barricadePlacement(map, { x: 72, y: 48 })).toEqual({
      ok: true, point: { x: 60, y: 60, angle: Math.PI / 4, distance: Math.hypot(60, 60) },
    });
    expect(barricadePlacement(map, { x: 120, y: 90 })).toEqual({
      ok: true, point: { x: 105, y: 105, angle: Math.PI / 4, distance: Math.hypot(105, 105) },
    });
  });

  it('refusals leave the entire state unchanged, including any existing wall', () => {
    const setup = createGame({ map: LINE });
    const locked = arena([], 2);
    const active = arena([enemy(0, 'troll', 200)]);
    expect(useSpecial(active, 'barricade', WALL).ok).toBe(true);
    const charged = structuredClone(active);
    ticks(charged, 1200);
    const ended = { ...active, phase: 'lost' } as const;
    for (const [state, point, reason] of [
      [setup, WALL, 'not-in-wave'],
      [locked, WALL, 'locked'],
      [active, WALL, 'no-charge'],
      [ended, WALL, 'game-over'],
      [charged, { x: 0, y: 240 }, 'near-spawn'],
      [charged, { x: 960, y: 240 }, 'near-exit'],
      [charged, { x: 160, y: 300 }, 'off-trail'],
      [charged, { x: 160, y: -1 }, 'out-of-bounds'],
      [charged, { x: NaN, y: 240 }, 'out-of-bounds'],
    ] as const) {
      const before = structuredClone(state);
      expect(useSpecial(state, 'barricade', point)).toEqual({ ok: false, reason });
      expect(state).toEqual(before);
    }
  });

  it('placement causes no damage, no kill, no zone and no gold change', () => {
    const state = arena([enemy(0, 'goblin')]);
    const before = structuredClone(state);
    const aimed = { x: WALL.x, y: WALL.y + 20 };
    expect(useSpecial(state, 'barricade', aimed)).toEqual({ ok: true, hits: 0, kills: 0, gold: before.gold });
    expect(state.enemies).toEqual(before.enemies);
    expect(state.zones).toEqual([]);
    expect(state.gold).toBe(before.gold);
    expect(state.blocker).toEqual({ ...WALL, distance: WALL.x, angle: 0, hp: BARRICADE_HP, maxHp: BARRICADE_HP });
    expect(state.events.slice(before.events.length)).toEqual([
      { kind: 'special', type: 'barricade', ...WALL, radius: 0, hits: 0, angle: 0 },
    ]);
  });

  it('replaces a damaged wall at full HP and people already past either wall keep walking', () => {
    const pair = arena([enemy(0, 'goblin'), enemy(1, 'troll', 260)]);
    expect(useSpecial(pair, 'barricade', WALL).ok).toBe(true);
    tick(pair);
    expect(pair.blocker?.hp).toBeCloseTo(BARRICADE_HP - 0.1, 10);
    expect(callNextWave(pair).ok).toBe(true);
    expect(pair.blocker?.hp).toBeCloseTo(BARRICADE_HP - 0.1, 10);
    expect(useSpecial(pair, 'barricade', { x: 200, y: 240 }).ok).toBe(true);
    expect(pair.blocker).toEqual({ x: 200, y: 240, angle: 0, distance: 200, hp: BARRICADE_HP, maxHp: BARRICADE_HP });
    expect(pair.events.some((e) => e.kind === 'blockerBreak')).toBe(false);
    tick(pair);
    expect(pair.enemies.slice(0, 2).map((e) => e.distance)).toEqual([161, (260 + 35 / 60) + 35 / 60]);
    expect(pair.blocker?.hp).toBe(BARRICADE_HP);
  });
});

describe('enemy contact and combat', () => {
  it('clamps exact arrival and overshoot, applies mixed DPS, and never pulls an enemy back', () => {
    const state = arena([
      enemy(0, 'goblin', 159), enemy(1, 'wolf', 159), enemy(2, 'shieldbearer'),
      enemy(3, 'troll'), enemy(4, 'goblin', 160.01), enemy(5, 'harpy', 159),
    ]);
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    tick(state);
    expect(state.enemies.map((e) => e.distance)).toEqual([160, 160, 160, 160, 161.01, 160.5]);
    expect(state.blocker?.hp).toBeCloseTo(BARRICADE_HP - (6 + 8 + 12 + 45) / 60, 10);
    expect(state.events).toEqual([
      { kind: 'blockerHit', enemyId: 0, ...WALL, damage: 6 / 60 },
      { kind: 'blockerHit', enemyId: 1, ...WALL, damage: 8 / 60 },
      { kind: 'blockerHit', enemyId: 2, ...WALL, damage: 12 / 60 },
      { kind: 'blockerHit', enemyId: 3, ...WALL, damage: 45 / 60 },
    ]);
  });

  it('the generic movement rule selects the first crossed live blocker and defers breaks per blocker', () => {
    const near: Blocker = { ...WALL, angle: 0, distance: 160, hp: 0.1, maxHp: 1 };
    const far: Blocker = { x: 161, y: 240, angle: 0, distance: 161, hp: 1, maxHp: 1 };
    const enemies = [enemy(0, 'wolf', 159.5), enemy(1, 'wolf', 159.5), enemy(2, 'goblin', 160.5)];
    const events: GameEvent[] = [];
    moveEnemies(enemies, events, [far, near]);
    expect(enemies.map((e) => e.distance)).toEqual([160, 160, 161]);
    expect(near.hp).toBe(0);
    expect(far.hp).toBe(0.9);
    expect(events).toEqual([
      { kind: 'blockerHit', enemyId: 0, ...WALL, damage: 8 / 60 },
      { kind: 'blockerHit', enemyId: 1, ...WALL, damage: 8 / 60 },
      { kind: 'blockerHit', enemyId: 2, x: 161, y: 240, damage: 6 / 60 },
      { kind: 'blockerBreak', ...WALL, angle: 0 },
    ]);
    moveEnemies(enemies, [], [far, near]);
    expect(enemies.map((e) => e.distance)).toEqual([161, 161, 161]);
    expect(far.hp).toBeCloseTo(0.9 - (8 + 8 + 6) / 60, 10);
  });

  it('targets the stopped pair by trail position and resolves ties by spawn id', () => {
    const state = arena([enemy(3, 'goblin', 159), enemy(2, 'wolf', 159), enemy(1, 'goblin', 150)]);
    const gun = buildTower(state, { col: 4, row: 5 }, 'musketeer');
    if (!gun.ok) throw new Error('expected a Musketeer on the firing lane');
    gun.tower.cooldownTicks = 60;
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    tick(state);
    expect(state.enemies.map(e => e.distance)).toEqual([160, 160, 151]);
    expect(findTarget(state, gun.tower)?.id).toBe(2);
    gun.tower.targeting = 'last';
    expect(findTarget(state, gun.tower)?.id).toBe(1);
  });

  it('stopped enemies still acquire slows, keep burning, take splash, and pay each bounty once', () => {
    const state = arena([enemy(0, 'goblin', 159, 300), enemy(1, 'goblin', 159.5, 300)]);
    state.gold = 210;
    const tar = buildTower(state, { col: 4, row: 5 }, 'tarpit');
    const fire = buildTower(state, { col: 5, row: 5 }, 'firepot');
    const cannon = buildTower(state, { col: 6, row: 5 }, 'cannon');
    const gold = state.gold;
    expect(tar.ok && fire.ok && cannon.ok).toBe(true);
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    tick(state);
    expect(state.enemies.map((e) => [e.distance, e.hp])).toEqual([[160, 268], [160, 275]]);
    expect(state.enemies[0]).toMatchObject({ slow: 0.4, slowTicksLeft: 120, burnDps: 5, burnTicksLeft: 180 });
    tick(state);
    expect(state.enemies[0]).toMatchObject({ distance: 160, slowTicksLeft: 119, burnTicksLeft: 179 });
    expect(state.enemies[0].hp).toBeCloseTo(268 - 10 / 60, 10);
    expect(state.blocker?.hp).toBeCloseTo(BARRICADE_HP - 0.4, 10);
    // Put both within a known splash kill, with no intervening competing shots.
    for (const e of state.enemies) e.hp = 20;
    if (!cannon.ok) throw new Error('Cannon build failed');
    cannon.tower.cooldownTicks = 0;
    tick(state);
    expect(state.enemies).toEqual([]);
    expect(state.events.filter((e) => e.kind === 'kill')).toEqual([
      { kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty: 2, cause: 'shot' },
      { kind: 'kill', enemyId: 1, enemyType: 'goblin', bounty: 2, cause: 'shot' },
    ]);
    expect(cannon.tower.kills).toBe(2);
    expect(state.gold).toBe(gold + 2 + 2 + 25);
    expect(state.phase).toBe('setup');
    const survivingWall = structuredClone(state.blocker);
    expect(survivingWall?.hp).toBeCloseTo(BARRICADE_HP - 0.6, 10);
    ticks(state, 600);
    expect(state.blocker).toEqual(survivingWall);
    expect(state.gold).toBe(gold + 29);
    expect(startWave(state).ok).toBe(true);
    expect(state.blocker).toEqual(survivingWall);
  });

  it.each([
    ['boss', 10, 65], ['grumblemaw', 20, 49],
  ] as const)('K4: a solo %s in wave %i breaks a fresh wall on contact tick %i', (type, wave, breakTick) => {
    const state = arena([enemy(0, type)], wave);
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    ticks(state, breakTick - 1);
    expect(state.blocker?.hp).toBeCloseTo(BARRICADE_HP - (breakTick - 1) * ENEMY_STATS[type].blockerDps / 60, 10);
    tick(state);
    expect(state.blocker).toBeNull();
    expect(state.enemies[0]).toMatchObject({ distance: WALL.x, hp: ENEMY_STATS[type].hp });
    expect(state.events.at(-1)).toEqual({ kind: 'blockerBreak', ...WALL, angle: 0 });
    expect(breakTick).toBeLessThanOrEqual(120);
    tick(state);
    expect(state.enemies[0].distance).toBeCloseTo(WALL.x + ENEMY_STATS[type].speed / 60, 10);
  });

  it('K5: ten Goblins hold for all 324 ticks, including the break tick, then all resume', () => {
    const state = arena(Array.from({ length: 10 }, (_, id) => enemy(id, 'goblin', 159)));
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    ticks(state, 323);
    expect(state.blocker?.hp).toBe(1);
    tick(state);
    expect(state.enemies.map((e) => e.distance)).toEqual(Array(10).fill(160));
    expect(state.events.map((e) => e.kind)).toEqual([...Array(10).fill('blockerHit'), 'blockerBreak']);
    expect(state.blocker).toBeNull();
    tick(state);
    expect(state.enemies.map((e) => e.distance)).toEqual(Array(10).fill(161));
    expect(state.events).toEqual([]);
  });

  it('K6: a Harpy flies the full 960 px on the same 640th tick with or without a wall', () => {
    const bare = arena([enemy(0, 'harpy', 0)]);
    const walled = structuredClone(bare);
    expect(useSpecial(walled, 'barricade', WALL).ok).toBe(true);
    ticks(bare, 639);
    ticks(walled, 639);
    expect(bare.enemies[0].distance).toBe(958.5);
    expect(walled.enemies).toEqual(bare.enemies);
    tick(bare);
    tick(walled);
    expect(bare.events[0]).toEqual({ kind: 'exit', enemyId: 0 });
    expect(walled.events).toEqual(bare.events);
    expect(walled.lives).toBe(bare.lives);
    expect(walled.blocker?.hp).toBe(BARRICADE_HP);
  });

  it.each(['easy', 'normal', 'hard'] as const)('uses the same blocker HP and damage on %s in act 2 with rewards', (difficulty) => {
    const state = arena([enemy(0, 'troll')], 18, difficulty);
    state.boons = ['stickyTar', 'hotCoals', 'biggerBlasts'];
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    tick(state);
    expect(state.blocker?.hp).toBe(BARRICADE_HP - 0.75);
  });
});

describe('recharge, endless and deterministic replay', () => {
  it.each([1200, 684])('K7: waits all %i shared recharge ticks before a second cast', (recharge) => {
    const state = arena([enemy(0, 'troll', 200)], 7);
    if (recharge === 684) state.boons = ['quickHands'];
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    const before = structuredClone(state);
    expect(state.specialRechargeTicks).toBe(recharge);
    expect(useSpecial(state, 'barricade', { x: 200, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
    expect(useSpecial(state, 'keg', WALL)).toEqual({ ok: false, reason: 'no-charge' });
    expect(state).toEqual(before);
    ticks(state, recharge - 1);
    expect(state.specialCharges).toBe(0);
    expect(state.specialRechargeTicks).toBe(1);
    tick(state);
    expect(state.specialCharges).toBe(1);
    expect(state.specialRechargeTicks).toBe(0);
    expect(useSpecial(state, 'tarBarrel', WALL).ok).toBe(true);
    expect(state.specialRechargeTicks).toBe(recharge);
    expect(useSpecial(state, 'barricade', WALL)).toEqual({ ok: false, reason: 'no-charge' });
  });

  it('K7: an early-call refill cannot place two walls on the same tick', () => {
    const state = arena([enemy(0, 'troll', 260)]);
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    expect(callNextWave(state).ok).toBe(true);
    expect(state.specialCharges).toBe(1);
    const before = structuredClone(state);
    expect(useSpecial(state, 'barricade', { x: 200, y: 240 })).toEqual({ ok: false, reason: 'no-charge' });
    expect(state).toEqual(before);
    tick(state);
    expect(useSpecial(state, 'barricade', { x: 200, y: 240 }).ok).toBe(true);
    expect(state.blocker?.distance).toBe(200);
  });

  it('carries a surviving campaign wall into wave 21 where it stops an actual endless spawn', () => {
    const state = arena([], 20);
    expect(useSpecial(state, 'barricade', WALL).ok).toBe(true);
    tick(state);
    expect(state.phase).toBe('won');
    expect(continueEndless(state).ok).toBe(true);
    expect(state.specialCharges).toBe(0);
    expect(startWave(state).ok).toBe(true);
    expect(state.wave).toBe(21);
    expect(state.specialCharges).toBe(1);
    let contact = false;
    for (let i = 0; i < 300 && !contact; i++) {
      tick(state);
      const hit = state.events.find((event) => event.kind === 'blockerHit');
      if (hit?.kind !== 'blockerHit') continue;
      contact = true;
      expect(state.enemies.find((e) => e.id === hit.enemyId)?.distance).toBe(160);
      expect(state.blocker?.maxHp).toBe(BARRICADE_HP);
      expect(state.blocker?.hp).toBeLessThan(BARRICADE_HP);
    }
    expect(contact).toBe(true);
  });

  it('replays identical states and events and preserves exits, kills and gold after the delay', () => {
    const bare = arena([
      enemy(0, 'goblin', 159, 22), enemy(1, 'wolf', 159, 22), enemy(2, 'troll', pathLength(LINE) - 1),
    ]);
    expect(buildTower(bare, { col: 4, row: 5 }, 'cannon').ok).toBe(true);
    const walled = structuredClone(bare);
    const replay = structuredClone(bare);
    for (const s of [walled, replay]) expect(useSpecial(s, 'barricade', WALL).ok).toBe(true);
    const resolutions = (state: GameState) => state.events.filter((e) => e.kind === 'kill' || e.kind === 'exit');
    const bareEvents = [];
    const walledEvents = [];
    for (let i = 0; i < 3; i++) {
      tick(bare);
      tick(walled);
      tick(replay);
      expect(replay).toEqual(walled);
      bareEvents.push(...resolutions(bare));
      walledEvents.push(...resolutions(walled));
    }
    const expected = [
      { kind: 'kill', enemyId: 0, enemyType: 'goblin', bounty: 2, cause: 'shot' },
      { kind: 'kill', enemyId: 1, enemyType: 'wolf', bounty: 2, cause: 'shot' },
      { kind: 'exit', enemyId: 2 },
    ];
    expect(bareEvents).toEqual(expected);
    expect(walledEvents).toEqual(expected);
    expect(walled.phase).toBe('setup');
    expect(walled.gold).toBe(bare.gold);
    expect(walled.lives).toBe(bare.lives);
  });
});
