import { describe, expect, it } from 'vitest';
import type { TowerType } from './types';
import { PATH_SCENARIOS, measurePathScenario, summarizePathBalance, type PathScenario, type PathRow } from './pathBalance';

export function testPathBalance(towers: readonly TowerType[]) {
  describe.each(towers)('%s on Normal with default rewards and specials', (tower) => {
    const scenarios = PATH_SCENARIOS.filter((scenario) => scenario.tower === tower);
    const measured = new Map<string, PathRow>();
    function measure(scenario: PathScenario) {
      const key = `${scenario.build}/${scenario.map}`;
      const cached = measured.get(key);
      if (cached) return cached;
      const row = measurePathScenario(scenario);
      measured.set(key, row);
      return row;
    }
    function scores() {
      return summarizePathBalance(scenarios.map(measure)).find((row) => row.tower === tower)!;
    }

    it.each(scenarios)('$build on $map buys the intended branches and equal-cost packages', (scenario) => {
      const row = measure(scenario);
      expect(row.pathValid, JSON.stringify(row)).toBe(true);
      expect(row.copyValid, JSON.stringify(row)).toBe(true);
      expect(row.count).toBeGreaterThan(0);
      expect(row.budgets).toEqual([row.gold, row.gold, row.gold]);
    });

    it('P1: paths differ somewhere and each leads or ties somewhere', () => {
      const summary = scores();
      expect(summary.p1, JSON.stringify(summary)).toBe(true);
    });

    it('P2: neither path loses by more than nine lives', () => {
      const summary = scores();
      expect(summary.p2, JSON.stringify(summary)).toBe(true);
    });

    it('P4: an equal-gold path wins somewhere and a copy wins or ties somewhere', () => {
      const summary = scores();
      expect(summary.p4.aWin || summary.p4.bWin, JSON.stringify(summary)).toBe(true);
      expect(summary.p4.aCopy || summary.p4.bCopy, JSON.stringify(summary)).toBe(true);
    });
  });
}
