// Verifier (milestone 12): sim-side recheck of the e2e new-towers frame
// (the e2e test only runs in Playwright). Milestone 22: the wave 5 Harpies
// draw the Longbow's fire, the Goblins live longer and the Mortar's cycle
// moved (fires at 1488 and 1668, no longer 1752), so the frame moved from
// tick 1754 to 1490 (2 ticks after a Mortar shot, as before). Milestone 25c:
// the Mortar fires at 1386, 1566 and 1746; the frame is tick 1748.
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { createGame, startWave, tick } from './game';
import { ENEMY_STATS } from './enemies';

describe('new-towers frame, sim side', () => {
  // Milestone 25c second pass: the Mortar fires at 1836, 2016, 2196; tick
  // 2198 has its splash on screen, Troll 13 slowed and burning, and the
  // wave's tail of Goblins behind (some hurt).
  it('at tick 2198 of wave 5: Troll 13 slowed and burning at 375 of 900 hp, two more Trolls, 10 Goblins', () => {
    const s = createGame();
    s.gold = 5000;
    s.wave = 4;
    for (const [col, row, type] of [[6, 5, 'longbow'], [17, 6, 'mortar'], [14, 8, 'firepot'], [14, 6, 'tarpit']] as const) {
      buildTower(s, { col, row }, type);
      upgradeTower(s, { col, row });
    }
    startWave(s);
    const mortarTicks: number[] = [];
    for (let i = 1; i <= 2198; i++) {
      tick(s);
      if (s.shots.some((x) => x.tower === 'mortar')) mortarTicks.push(i);
    }
    expect(mortarTicks.slice(-3)).toEqual([1836, 2016, 2196]);
    expect(ENEMY_STATS.troll.hp).toBe(900);
    expect(s.enemies.map((e) => `${e.type} ${e.id} ${Math.round(e.hp)}`)).toEqual([
      'troll 13 375', 'troll 29 882', 'goblin 38 1', 'troll 39 900', 'goblin 41 1', 'goblin 42 10',
      'goblin 43 19', 'goblin 44 19', 'goblin 45 19', 'goblin 46 19', 'goblin 47 19', 'goblin 48 19', 'goblin 49 19',
    ]);
    const sb = s.enemies.filter((e) => e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0);
    expect(sb.map((e) => e.id)).toEqual([13]);
  });
});
