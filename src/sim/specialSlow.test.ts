// Milestone 25c: the special slow channel (docs/SCOPE-v4.md 25c, the 25b
// "For 25c" note in DECISIONS.md). The Tar Barrel's slow lives on its own
// fields (specialSlow, specialSlowTicksLeft) so a tower slow never wastes or
// cuts it short. Effective slow = max of the two active channels, boss cap
// on the result; "tarred" (burn doubling) means either is active.
import { describe, expect, it } from 'vitest';
import { buildTower, useSpecial } from './actions';
import { applySlow, applySpecialSlow } from './combat';
import { effectiveSlow, ENEMY_STATS, isTarred } from './enemies';
import { createGame, startWave, tick } from './game';
import { SPECIAL_DEFS } from './specials';
import type { Enemy, EnemyType, GameState } from './types';
import { WAVES } from './waves';

function enemy(id: number, type: EnemyType, extra: Partial<Enemy> = {}): Enemy {
  return { id, type, hp: ENEMY_STATS[type].hp, distance: 80, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0, ...extra };
}

function inWave(wave: number, enemies: Enemy[]): GameState {
  const s = createGame();
  s.wave = wave - 1;
  expect(startWave(s).ok).toBe(true);
  s.spawnedPerGroup = WAVES[wave - 1].groups.map((g) => g.count);
  s.enemies = enemies;
  s.nextEnemyId = 100;
  s.events = [];
  return s;
}

describe('effectiveSlow and isTarred', () => {
  it('is the stronger active channel; an expired channel counts as 0', () => {
    expect(effectiveSlow(enemy(0, 'goblin'))).toBe(0);
    expect(effectiveSlow(enemy(0, 'goblin', { slow: 0.4, slowTicksLeft: 5 }))).toBe(0.4);
    expect(effectiveSlow(enemy(0, 'goblin', { specialSlow: 0.5, specialSlowTicksLeft: 5 }))).toBe(0.5);
    expect(effectiveSlow(enemy(0, 'goblin', { slow: 0.6, slowTicksLeft: 5, specialSlow: 0.5, specialSlowTicksLeft: 5 }))).toBe(0.6);
    expect(effectiveSlow(enemy(0, 'goblin', { slow: 0.4, slowTicksLeft: 5, specialSlow: 0.5, specialSlowTicksLeft: 5 }))).toBe(0.5);
    expect(effectiveSlow(enemy(0, 'goblin', { slow: 0.6, slowTicksLeft: 0, specialSlow: 0.5, specialSlowTicksLeft: 5 }))).toBe(0.5);
    expect(effectiveSlow(enemy(0, 'goblin', { slow: 0.6, slowTicksLeft: 5, specialSlow: 0.5, specialSlowTicksLeft: 0 }))).toBe(0.6);
  });

  it('the boss cap (0.3) applies to the effective value', () => {
    expect(effectiveSlow(enemy(0, 'boss', { slow: 0.6, slowTicksLeft: 5, specialSlow: 0.5, specialSlowTicksLeft: 5 }))).toBe(0.3);
    expect(effectiveSlow(enemy(0, 'boss', { specialSlow: 0.2, specialSlowTicksLeft: 5 }))).toBe(0.2);
  });

  it('tarred means either channel is active', () => {
    expect(isTarred(enemy(0, 'troll'))).toBe(false);
    expect(isTarred(enemy(0, 'troll', { slowTicksLeft: 1 }))).toBe(true);
    expect(isTarred(enemy(0, 'troll', { specialSlowTicksLeft: 1 }))).toBe(true);
  });

  it('a spawned enemy starts with an empty special channel', () => {
    const s = createGame();
    startWave(s);
    tick(s);
    expect(s.enemies[0]).toMatchObject({ specialSlow: 0, specialSlowTicksLeft: 0 });
  });
});

describe('applySpecialSlow', () => {
  it('caps at the boss cap, replaces an equal or weaker special slow, ignores a weaker one', () => {
    const boss = enemy(0, 'boss');
    expect(applySpecialSlow(boss, 0.5, 240)).toBe(0.3);
    expect([boss.specialSlow, boss.specialSlowTicksLeft]).toEqual([0.3, 240]);
    const e = enemy(1, 'goblin', { specialSlow: 0.5, specialSlowTicksLeft: 10 });
    expect(applySpecialSlow(e, 0.4, 240)).toBeNull();
    expect([e.specialSlow, e.specialSlowTicksLeft]).toEqual([0.5, 10]);
    expect(applySpecialSlow(e, 0.5, 240)).toBe(0.5);
    expect(e.specialSlowTicksLeft).toBe(240);
  });

  it('never touches the tower channel, and a tower slow never touches the special channel', () => {
    const e = enemy(0, 'goblin', { slow: 0.6, slowTicksLeft: 50 });
    applySpecialSlow(e, 0.5, 240);
    expect([e.slow, e.slowTicksLeft]).toEqual([0.6, 50]);
    applySlow(e, 0.4, 120);
    expect([e.slow, e.slowTicksLeft, e.specialSlow, e.specialSlowTicksLeft]).toEqual([0.6, 50, 0.5, 240]);
    const f = enemy(1, 'goblin', { specialSlow: 0.5, specialSlowTicksLeft: 240 });
    expect(applySlow(f, 0.4, 120)).toBe(0.4); // the tower channel was empty
    expect([f.slow, f.slowTicksLeft, f.specialSlow, f.specialSlowTicksLeft]).toEqual([0.4, 120, 0.5, 240]);
  });
});

describe('the barrel is never wasted or cut short by tower slows', () => {
  it('a Tar Pit hitting a barrel-tarred Goblin does not shorten the barrel: it walks at 0.5 for the full 210 ticks', () => {
    // Tar Pit at (3,5), centre (112, 176): reaches the first run.
    const s = inWave(4, [enemy(0, 'goblin', { hp: 1e6, distance: 60 })]);
    buildTower(s, { col: 3, row: 5 }, 'tarpit');
    useSpecial(s, 'tarBarrel', { x: 60, y: 240 });
    let slowedByPit = 0;
    for (let i = 0; i < 210; i++) {
      tick(s);
      slowedByPit += s.events.filter((e) => e.kind === 'slowed').length;
      if (i < 209) expect(effectiveSlow(s.enemies[0]), `tick ${i}`).toBe(0.5);
    }
    expect(slowedByPit).toBeGreaterThan(0); // the pit did hit it (0.4 on the tower channel)
    // 210 ticks at 0.5: 210 * 60 * 0.5 / 60 = 105 px.
    expect(s.enemies[0].distance).toBeCloseTo(60 + 105, 9);
    expect(s.enemies[0].specialSlowTicksLeft).toBe(0);
  });

  it('a burn doubles under the special slow alone (Fire Arrows, 30/s, on a barrel-tarred Troll: 60 over 60 ticks, 30 untarred)', () => {
    const s = inWave(7, [enemy(0, 'troll', { specialSlow: 0.5, specialSlowTicksLeft: 1000 }), enemy(1, 'troll')]);
    useSpecial(s, 'fireArrows', { x: 80, y: 240 });
    for (let i = 0; i < 60; i++) tick(s);
    const dps = SPECIAL_DEFS.fireArrows.burnDps;
    expect(ENEMY_STATS.troll.hp - s.enemies[0].hp).toBeCloseTo(2 * dps, 9);
    expect(ENEMY_STATS.troll.hp - s.enemies[1].hp).toBeCloseTo(dps, 9);
  });
});
