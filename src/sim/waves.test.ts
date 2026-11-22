import { describe, expect, it } from 'vitest';
import { ENEMY_STATS } from './enemies';
import { createGame, spawnTick } from './game';
import { nextWavePreview, waveDef, WAVES } from './waves';

describe('waves', () => {
  it('has 20 waves', () => {
    expect(WAVES).toHaveLength(20);
  });

  // Milestone 25c counts.
  it('previews wave 1 before the game starts', () => {
    const state = createGame();
    expect(nextWavePreview(state)).toEqual([{ type: 'goblin', count: 20 }]);
  });

  it('previews wave 3 after wave 2', () => {
    const state = { ...createGame(), wave: 2 };
    expect(nextWavePreview(state)).toEqual([
      { type: 'goblin', count: 22 },
      { type: 'wolf', count: 12 },
    ]);
  });

  it('previews campaign wave 11 without endless scaling after the mid-boss', () => {
    const state = { ...createGame(), wave: 10 };
    expect(nextWavePreview(state)).toEqual(WAVES[10].groups.map(({ type, count }) => ({ type, count })));
    expect(waveDef(11)).toBe(WAVES[10]);
    expect(waveDef(11).hpMultiplier).toBeUndefined();
  });

  it('previews nothing after wave 20', () => {
    const state = { ...createGame(), wave: 20 };
    expect(nextWavePreview(state)).toEqual([]);
  });
});

// Milestone 25c second pass (A1): spawn rate. In any 3 s (180 ticks) of any
// wave at most 6 walkers and at most 4 flyers spawn, read from the tables.
describe('spawn rate (milestone 25c, A1)', () => {
  /** The most spawn ticks inside any half-open window [t, t + 180). */
  const maxIn180 = (ticks: number[]) => {
    const a = [...ticks].sort((x, y) => x - y);
    let best = 0;
    for (let i = 0; i < a.length; i++) {
      let j = i;
      while (j < a.length && a[j] < a[i] + 180) j += 1;
      best = Math.max(best, j - i);
    }
    return best;
  };
  const spawns = (wave: number, flying: boolean) =>
    WAVES[wave].groups.filter((g) => ENEMY_STATS[g.type].flying === flying).flatMap((g) => Array.from({ length: g.count }, (_, i) => spawnTick(g, i)));

  it('at most 6 walkers and 4 flyers in any 3 s window, every wave', () => {
    const got = WAVES.map((_, w) => [maxIn180(spawns(w, false)), maxIn180(spawns(w, true))]);
    for (const [w, [ground, fly]] of got.entries()) {
      expect(ground, `wave ${w + 1} walkers`).toBeLessThanOrEqual(6);
      expect(fly, `wave ${w + 1} flyers`).toBeLessThanOrEqual(4);
    }
  });

  it('the window check itself: a 0.5 s group gives 6, a 0.45 s group 7', () => {
    const g = (interval: number) => ({ type: 'goblin' as const, count: 20, interval, delay: 0 });
    expect(maxIn180(Array.from({ length: 20 }, (_, i) => spawnTick(g(0.5), i)))).toBe(6);
    expect(maxIn180(Array.from({ length: 20 }, (_, i) => spawnTick(g(0.45), i)))).toBe(7);
  });

  it('A5: every wave spawns within 90 s, and the boss comes 2 s after wave 10\'s last other spawn', () => {
    for (const w of WAVES) expect(Math.max(...w.groups.map((g) => spawnTick(g, g.count - 1)))).toBeLessThanOrEqual(90 * 60);
    const groups = WAVES[9].groups;
    const boss = groups.find((g) => g.type === 'boss')!;
    const others = Math.max(...groups.filter((g) => g.type !== 'boss').map((g) => spawnTick(g, g.count - 1)));
    expect(spawnTick(boss, 0)).toBe(others + 120);
  });
});
