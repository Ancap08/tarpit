// Milestone 8 verifier: the mid-wave frame pin (e2e/visual.spec.ts, tick 848;
// milestone 25c second pass: wave 1 tick 1160; milestone 28: wave 1 tick
// 155; milestone 28 follow-up: wave 2 tick 1904, see the comment there).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';

describe('mid-wave frame pin', () => {
  // Milestone 28 follow-up (verifier's proposal): wave 1's Goblins come every
  // 2.5 s and the Musketeer alone clears them, so the frame plays wave 2
  // (state.wave = 1, then Start Wave). Tick 1904: 15 Goblins out, 10 hurt,
  // 2 tarred, the Cannon's splash 3 ticks into its fade (fired at 1901), the
  // Tar Pit's shot 2 ticks old (1902), no shot on this tick, 20 lives.
  it('tick 1904 of wave 2 with Musketeer (7,5), Cannon (15,9), Tar Pit (18,9): 15 Goblins, 10 hurt, 2 tarred, Cannon 3 and Tar Pit 2 ticks ago', () => {
    const s = createGame();
    s.gold = 1000;
    s.wave = 1;
    for (const [cell, type] of [
      [{ col: 7, row: 5 }, 'musketeer'],
      [{ col: 15, row: 9 }, 'cannon'],
      [{ col: 18, row: 9 }, 'tarpit'],
    ] as const) {
      expect(buildTower(s, cell, type).ok).toBe(true);
    }
    expect(startWave(s)).toEqual({ ok: true, wave: 2 });
    const cannon: number[] = [];
    const tar: number[] = [];
    for (let i = 1; i <= 1904; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'cannon')) cannon.push(i);
      if (s.shots.some((x) => x.tower === 'tarpit')) tar.push(i);
    }
    const e = s.enemies;
    expect({
      enemies: e.length,
      goblins: e.filter((x) => x.type === 'goblin').length,
      hurt: e.filter((x) => x.hp < 23).length,
      tarred: e.filter((x) => x.slowTicksLeft > 0).length,
      shots: s.shots.length,
      lives: s.lives,
    }).toEqual({ enemies: 15, goblins: 15, hurt: 10, tarred: 2, shots: 0, lives: 20 });
    expect([cannon.at(-1), tar.at(-1)]).toEqual([1901, 1902]);
  });
});
