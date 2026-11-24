import { describe, expect, it } from 'vitest';
import { checkCampaign, checkLevel, type LevelContext } from './checkLevel';
import type { LevelDef } from './levelTypes';
import { LEVELS } from './levels';

const late: LevelContext = { band: 'late', introduces: null };
const easy: LevelDef = {
  ...LEVELS[2], id: 105, taxes: { rationing: 100 }, feat: { kind: 'noLeaks' },
};

describe('tax gate rejection witnesses', () => {
  it('T1 rejects a cap which Person never reaches in any of the five matched trials', () => {
    const result = checkLevel(easy, late);
    expect(result.failed).toContain('T1');
    expect(result.taxTrials?.map(trial => [trial.variant, trial.personWithout.lives - trial.person.lives])).toEqual([
      ['base', 0], ['hp-2%', 0], ['hp+2%', 0], ['gold-10', 0], ['gold+10', 0],
    ]);
  }, 60_000);

  it('T2 rejects a sealed purse that leaves Person unable to win', () => {
    const result = checkLevel({ ...LEVELS[6], taxes: { frozenPurse: 0 }, feat: { kind: 'noSpecials' } }, late);
    expect(result.person?.phase).toBe('lost');
    expect(result.failed).toContain('T2');
  }, 60_000);

  it('F1 rejects an award Good cannot earn even deliberately', () => {
    const result = checkLevel({ ...LEVELS[0], feat: { kind: 'maxTowers', limit: 0 } }, late);
    expect(result.good?.stars).toBe(2);
    expect(result.featGood?.stars).toBe(0);
    expect(result.failed).toContain('F1');
  }, 60_000);

  it('F1 rejects a campaign where normal play earns more than half the feats by accident', () => {
    const result = checkCampaign([easy], [{ ...late, introducesTax: 'rationing' }]);
    const [row] = result.levels;
    expect([row.good?.stars, row.person?.stars, row.featGood?.stars, row.beginner?.stars]).toEqual([3, 3, 3, 2]);
    expect(row.failed).not.toContain('F1');
    expect(result.failed).toContain('F1');
  }, 60_000);

  it('T3 rejects a first appearance beside a second tax, and undeclared or repeated introductions', () => {
    const tax = { ...late, introducesTax: 'rationing' } as const;
    const pair = { ...easy, taxes: { ...easy.taxes, windowTax: 0.05 } };
    expect(checkLevel(pair, tax).failed).toContain('T3');
    expect(checkCampaign([pair], [late]).failed).toContain('T3');
    expect(checkCampaign([easy], [late]).failed).toContain('T3');
    expect(checkCampaign([easy, { ...easy, id: 876 }], [tax, tax]).failed).toContain('T3');
  }, 90_000);

  it('L7 rejects malformed tax rates and feat limits before running a candidate', () => {
    for (const taxes of [{ windowTax: 0.011 }, { frozenPurse: 0.5 }, { forcedMarch: 0.26 },
      { curfew: 0.21 }, { noLoitering: 7 }, { rationing: 0 }, { curfew: 0.1, rationing: 2, noLoitering: 8 }]) {
      expect(checkLevel({ ...easy, taxes }, late).failed).toEqual(['L7']);
    }
    expect(checkLevel({ ...easy, feat: { kind: 'maxTowers', limit: 1.2 } }, late).failed).toEqual(['L7']);
  });
});
