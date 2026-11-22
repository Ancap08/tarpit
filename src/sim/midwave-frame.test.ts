// Milestone 8 verifier: the mid-wave frame pin (e2e/visual.spec.ts, tick 848;
// milestone 25c: tick 874, see the comment there).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';

describe('mid-wave frame pin', () => {
  it('tick 874 of wave 1 with Musketeer (7,5), Cannon (15,9), Tar Pit (18,9): 6 enemies, none hurt, Musketeer fired 2 ticks ago, Cannon and Tar Pit never fire in wave 1', () => {
    const s = createGame();
    s.gold = 1000;
    for (const [cell, type] of [
      [{ col: 7, row: 5 }, 'musketeer'],
      [{ col: 15, row: 9 }, 'cannon'],
      [{ col: 18, row: 9 }, 'tarpit'],
    ] as const) {
      expect(buildTower(s, cell, type).ok).toBe(true);
    }
    expect(startWave(s).ok).toBe(true);
    const shotTicks: Record<string, number[]> = {};
    let at874 = { enemies: -1, hurt: -1 };
    for (let i = 1; s.phase === 'wave'; i++) {
      tick(s);
      for (const x of s.shots) (shotTicks[x.tower] ??= []).push(i);
      if (i === 874) at874 = { enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 12).length };
    }
    expect(at874).toEqual({ enemies: 6, hurt: 0 });
    expect(Object.keys(shotTicks)).toEqual(['musketeer']);
    expect(shotTicks.musketeer.filter((t) => t >= 860 && t <= 874)).toEqual([872]);
  });
});
