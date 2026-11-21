// Milestone 8 verifier: the mid-wave frame pin (e2e/visual.spec.ts, tick 848).
import { describe, expect, it } from 'vitest';
import { buildTower } from './actions';
import { createGame, startWave, tick } from './game';

describe('mid-wave frame pin', () => {
  it('tick 848 of wave 1 with Musketeer (7,5), Cannon (15,9), Tar Pit (18,9): 5 enemies, 4 hurt, Cannon fired 3 ticks ago', () => {
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
    for (let i = 1; i <= 855; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'cannon')) cannonShotTicks.push(i);
      if (i === 848) {
        expect({ enemies: s.enemies.length, hurt: s.enemies.filter((e) => e.hp < 30).length }).toEqual({ enemies: 5, hurt: 4 });
      }
    }
    console.log('cannon shot ticks', cannonShotTicks.slice(0, 3));
    expect(cannonShotTicks[0]).toBe(845);
  });
});
