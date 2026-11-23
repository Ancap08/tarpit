import { beforeAll, describe, expect, it } from 'vitest';
import type { TowerType } from './types';
import { PATH_SCENARIOS, measurePathScenario, summarizePathBalance, type PathRow } from './pathBalance';

export function testPathBalance(towers: readonly TowerType[]) {
  describe.each(towers)('%s on Normal with default rewards and specials', (tower) => {
    const scenarios = PATH_SCENARIOS.filter((scenario) => scenario.tower === tower);
    let rows: PathRow[];
    let summary: ReturnType<typeof summarizePathBalance>[number];

    beforeAll(() => {
      rows = scenarios.map(measurePathScenario);
      summary = summarizePathBalance(rows).find((row) => row.tower === tower)!;
    }, 30_000);

    it.each(scenarios)('$build on $map buys the intended branches and equal-cost packages', ({ build, map }) => {
      const row = rows.find((result) => result.build === build && result.map === map)!;
      expect(row.pathValid, JSON.stringify(row)).toBe(true);
      expect(row.copyValid, JSON.stringify(row)).toBe(true);
      expect(row.count).toBeGreaterThan(0);
      expect(row.budgets).toEqual([row.gold, row.gold, row.gold]);
    });

    it('P1: each path leads by at least two lives somewhere', () => {
      expect(summary.p1, JSON.stringify(summary)).toEqual({ a: true, b: true });
    });

    it('P2: neither path loses by more than six lives', () => {
      expect(summary.p2, JSON.stringify(summary)).toBe(true);
    });

    it('P4: an equal-gold path wins somewhere and a copy wins or ties somewhere', () => {
      expect(summary.p4.aWin || summary.p4.bWin, JSON.stringify(summary)).toBe(true);
      expect(summary.p4.aCopy || summary.p4.bCopy, JSON.stringify(summary)).toBe(true);
    });
  });
}
