// Verifier (milestone 12): sim-side recheck of the e2e new-towers frame
// (the e2e test only runs in Playwright). Milestone 22: the wave 5 Harpies
// draw the Longbow's fire, the Goblins live longer and the Mortar's cycle
// moved (fires at 1488 and 1668, no longer 1752), so the frame moved from
// tick 1754 to 1490 (2 ticks after a Mortar shot, as before).
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { createGame, startWave, tick } from './game';
import { ENEMY_STATS } from './enemies';

describe('new-towers frame, sim side', () => {
  it('at tick 1490 of wave 5: 2 Trolls, both slowed and burning, one at 417 of 700 hp, and a Harpy', () => {
    const s = createGame();
    s.gold = 5000;
    s.wave = 4;
    for (const [col, row, type] of [[6, 5, 'longbow'], [17, 6, 'mortar'], [14, 8, 'firepot'], [14, 6, 'tarpit']] as const) {
      buildTower(s, { col, row }, type);
      upgradeTower(s, { col, row });
    }
    startWave(s);
    const mortarTicks: number[] = [];
    for (let i = 1; i <= 1490; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'mortar')) mortarTicks.push(i);
    }
    expect(mortarTicks.at(-1)).toBe(1488);
    expect(ENEMY_STATS.troll.hp).toBe(700);
    expect(s.enemies.map((e) => e.type)).toEqual(['troll', 'troll', 'harpy']);
    const trolls = s.enemies.filter((e) => e.type === 'troll');
    expect(trolls.every((e) => e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0)).toBe(true);
    expect(trolls.map((e) => Math.round(e.hp))).toContain(417);
  });
});
