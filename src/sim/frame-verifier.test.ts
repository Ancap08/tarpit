// Verifier (milestone 12): sim-side recheck of the e2e new-towers frame
// (the e2e test only runs in Playwright). Milestone 22: the wave 5 Harpies
// draw the Longbow's fire, the Goblins live longer and the Mortar's cycle
// moved (fires at 1488 and 1668, no longer 1752), so the frame moved from
// tick 1754 to 1490 (2 ticks after a Mortar shot, as before). Milestone 25c:
// the Mortar fires at 1386, 1566 and 1746; the frame is tick 1748.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { enemyPosition } from './combat';
import { createGame, startWave, tick } from './game';
import { ENEMY_STATS } from './enemies';

describe('new-towers frame, sim side', () => {
  it('at tick 1748 of wave 5: 2 Trolls, 10 px apart, Troll 12 slowed and burning at 98 of 500 hp, Troll 5 at 61', () => {
    const s = createGame();
    s.gold = 5000;
    s.wave = 4;
    for (const [col, row, type] of [[6, 5, 'longbow'], [17, 6, 'mortar'], [14, 8, 'firepot'], [14, 6, 'tarpit']] as const) {
      buildTower(s, { col, row }, type);
      upgradeTower(s, { col, row });
    }
    startWave(s);
    const mortarTicks: number[] = [];
    for (let i = 1; i <= 1748; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'mortar')) mortarTicks.push(i);
    }
    expect(mortarTicks.slice(-3)).toEqual([1386, 1566, 1746]);
    expect(ENEMY_STATS.troll.hp).toBe(500);
    expect(s.enemies.map((e) => `${e.type} ${e.id} ${Math.round(e.hp)}`)).toEqual(['troll 5 61', 'troll 12 98']);
    const sb = s.enemies.filter((e) => e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0);
    expect(sb.map((e) => e.id)).toEqual([12]);
    const [a, b] = s.enemies.map((e) => enemyPosition(e));
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(10.2, 1);
  });
});
