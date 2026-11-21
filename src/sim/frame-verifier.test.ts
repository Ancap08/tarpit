// Verifier (milestone 12): sim-side recheck of the e2e new-towers frame at
// tick 1754 (the e2e test only runs in Playwright).
import { describe, expect, it } from 'vitest';
import { buildTower, upgradeTower } from './actions';
import { createGame, startWave, tick } from './game';
import { ENEMY_STATS } from './enemies';

describe('new-towers frame, sim side', () => {
  it('at tick 1754 of wave 5: 2 Trolls, both slowed and burning, one at 201 of 700 hp', () => {
    const s = createGame();
    s.gold = 5000;
    s.wave = 4;
    for (const [col, row, type] of [[6, 5, 'longbow'], [17, 6, 'mortar'], [14, 8, 'firepot'], [14, 6, 'tarpit']] as const) {
      buildTower(s, { col, row }, type);
      upgradeTower(s, { col, row });
    }
    startWave(s);
    for (let i = 0; i < 1754; i++) tick(s);
    expect(ENEMY_STATS.troll.hp).toBe(700);
    expect(s.enemies).toHaveLength(2);
    expect(s.enemies.every((e) => e.type === 'troll' && e.slowTicksLeft > 0 && (e.burnTicksLeft ?? 0) > 0)).toBe(true);
    expect(s.enemies.map((e) => Math.round(e.hp))).toContain(201);
  });
});
