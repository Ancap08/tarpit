// Milestone 8 verifier: the mid-wave frame pin (e2e/visual.spec.ts, tick 848;
// milestone 25c second pass: tick 1160, see the comment there).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';

describe('mid-wave frame pin', () => {
  // Milestone 25c second pass: 19 hp Goblins take two Musketeer shots, so
  // some reach the Cannon; tick 1160 shows its first shot (fired at 1157,
  // 3 ticks into its fade) with 10 Goblins out and 4 hurt.
  it('tick 1160 of wave 1 with Musketeer (7,5), Cannon (15,9), Tar Pit (18,9): 10 enemies, 4 hurt, Cannon fired 3 ticks ago', () => {
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
    const cannonShotTicks: number[] = [];
    for (let i = 1; i <= 1160; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'cannon')) cannonShotTicks.push(i);
    }
    expect({ enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 19).length }).toEqual({ enemies: 10, hurt: 4 });
    expect(cannonShotTicks).toEqual([1157]);
  });
});
