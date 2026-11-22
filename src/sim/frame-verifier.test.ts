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
  // wave's tail of Goblins behind (some hurt). Milestone 28 (Goblin 23,
  // Troll 950): the same tick, the same enemies, only their hp moved.
  it('at tick 2198 of wave 5: Troll 13 slowed and burning at 425 of 950 hp, two more Trolls, 10 Goblins', () => {
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
    expect(ENEMY_STATS.troll.hp).toBe(950);
    expect(s.enemies.map((e) => `${e.type} ${e.id} ${Math.round(e.hp)}`)).toEqual([
      'troll 13 425', 'troll 29 932', 'goblin 38 5', 'troll 39 950', 'goblin 41 5', 'goblin 42 14',
      'goblin 43 23', 'goblin 44 23', 'goblin 45 23', 'goblin 46 23', 'goblin 47 23', 'goblin 48 23', 'goblin 49 23',
    ]);
    const sb = s.enemies.filter((e) => e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0);
    expect(sb.map((e) => e.id)).toEqual([13]);
  });
});
