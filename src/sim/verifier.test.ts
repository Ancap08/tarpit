// Independent verifier tests for milestone 1. Written without reading the
// implementer's tests first; they drive state directly for edge cases.
import { describe, expect, it } from 'vitest';
import { createGame, startWave, tick } from './game';
import type { Enemy, GameState } from './types';
import { WAVES } from './waves';

function enemy(over: Partial<Enemy> & { id: number }): Enemy {
  return { type: 'goblin', hp: 30, distance: 0, slow: 0, slowTicksLeft: 0, ...over };
}

/** A wave-10 state with every enemy already spawned, as if mid-wave. */
function wave10AllSpawned(lives: number, enemies: Enemy[]): GameState {
  const s = createGame();
  s.phase = 'wave';
  s.wave = 10;
  s.lives = lives;
  s.spawnedPerGroup = WAVES[9].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 1000;
  return s;
}

describe('verifier: edge cases', () => {
  it('two groups on the same tick get ids in group order, and enemies stay in id order', () => {
    const s = createGame();
    s.wave = 8; // wave 9: 12 wolves every 0.5 s, 8 trolls every 2 s, both delay 0
    startWave(s);
    tick(s);
    expect(s.enemies.map((e) => [e.id, e.type])).toEqual([
      [0, 'wolf'],
      [1, 'troll'],
    ]);
    // Wolf index 4 (tick 120) and troll index 1 (tick 120) coincide again.
    for (let i = 0; i < 120; i++) tick(s);
    const ids = s.enemies.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    const last = s.enemies.slice(-2);
    expect(last.map((e) => e.type)).toEqual(['wolf', 'troll']);
    expect(last[1].id).toBe(last[0].id + 1);
  });

  it('an enemy that lands exactly on the exit distance is removed on that tick', () => {
    const s = createGame();
    startWave(s);
    s.spawnedPerGroup = [20]; // stop further spawns so only our enemy matters (wave 1: 20 Goblins since milestone 25c)
    s.enemies = [enemy({ id: 0, distance: 1583 })];
    tick(s);
    expect(s.enemies).toHaveLength(0);
    expect(s.lives).toBe(19);
  });

  it('a fast enemy that overshoots the exit is removed once and costs one life', () => {
    const s = createGame();
    startWave(s);
    s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
    s.enemies = [enemy({ id: 0, type: 'wolf', hp: 20, distance: 1583 })]; // +2 -> 1585
    tick(s);
    expect(s.enemies).toHaveLength(0);
    expect(s.lives).toBe(19);
  });

  it('startWave fails in the lost phase and changes nothing', () => {
    const s = createGame();
    s.phase = 'lost';
    s.lives = 0;
    const before = structuredClone(s);
    expect(startWave(s)).toEqual({ ok: false, reason: 'not-in-setup' });
    expect(s).toEqual(before);
  });

  it('a slow of 0.5 moves a goblin 0.5 px per tick; a stale slow with no ticks left is ignored', () => {
    const s = createGame();
    s.phase = 'wave';
    s.wave = 1;
    s.spawnedPerGroup = [20]; // wave 1 fully spawned (20 Goblins since milestone 25c)
    s.enemies = [enemy({ id: 0, slow: 0.5, slowTicksLeft: 10 }), enemy({ id: 1, slow: 0.5, slowTicksLeft: 0 })];
    tick(s);
    expect(s.enemies[0].distance).toBe(0.5);
    expect(s.enemies[1].distance).toBe(1);
  });

  it('clearing wave 10 with lives left is won, pays the bonus, and clearing wave 9 is not won', () => {
    const s = wave10AllSpawned(3, []);
    tick(s);
    expect(s.phase).toBe('won');
    expect(s.gold).toBe(125);
    const nine = wave10AllSpawned(3, []);
    nine.wave = 9;
    nine.spawnedPerGroup = WAVES[8].groups.map((g) => g.count);
    tick(nine);
    expect(nine.phase).toBe('setup');
  });

  it('the last enemy of wave 10 exiting with lives 1 is a loss, not a win, and pays no bonus', () => {
    const s = wave10AllSpawned(1, [enemy({ id: 0, distance: 1583 })]);
    tick(s);
    expect(s.lives).toBe(0);
    expect(s.phase).toBe('lost');
    expect(s.gold).toBe(100);
  });
});
