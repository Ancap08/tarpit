// Milestone 8 verifier: the mid-wave frame pin (e2e/visual.spec.ts, tick 848;
// milestone 25c second pass: tick 1160; milestone 28: tick 155, see the
// comment there).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';

describe('mid-wave frame pin', () => {
  // Milestone 28: wave 1's Goblins come every 2.5 s and the Musketeer kills
  // each one before it reaches the Cannon, which never fires in wave 1; at
  // most 2 Goblins are out at once. Tick 155 shows the Musketeer's tracer 3
  // ticks into its fade (fired at 152) with 2 Goblins out, 1 hurt.
  it('tick 155 of wave 1 with Musketeer (7,5), Cannon (15,9), Tar Pit (18,9): 2 enemies, 1 hurt, Musketeer fired 3 ticks ago, the Cannon never', () => {
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
    const shotTicks: number[] = [];
    for (let i = 1; i <= 155; i++) {
      tick(s);
      if (s.shots.length > 0) shotTicks.push(i);
    }
    expect({ enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 23).length, shots: s.shots.length }).toEqual({ enemies: 2, hurt: 1, shots: 0 });
    expect(shotTicks.at(-1)).toBe(152);
    // The rest of the wave: the Cannon and the Tar Pit never fire.
    let others = 0;
    while (s.phase === 'wave') {
      tick(s);
      others += s.shots.filter((x) => x.tower !== 'musketeer').length;
    }
    expect([others, s.lives]).toEqual([0, 20]);
  });
});
