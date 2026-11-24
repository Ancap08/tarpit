import { describe, expect, it } from 'vitest';
import { LEVELS, createGame, levelStars, runBot, type LevelTaxes } from '.';
import { CAMPAIGN_CONTEXTS } from './campaignContexts';
import { checkLevel } from './checkLevel';
import { botGoodFeat } from './bots';

const deliberate = (id: number, edit: (level: (typeof LEVELS)[number]) => (typeof LEVELS)[number]) => {
  const { state } = runBot(createGame({ level: edit(LEVELS[id - 1]) }), botGoodFeat, Infinity, 3600 * 60);
  return { stars: levelStars(state), lives: Math.max(0, state.lives) };
};

describe('F1 at the two verifier regressions', () => {
  it('levels 13 and 15 earn their feat at nominal', () => {
    expect(deliberate(13, l => l).stars).toBe(3);
    expect(deliberate(15, l => l).stars).toBe(3);
  }, 60_000);

  it('rejects a candidate whose deliberate run earns three stars only at some settings', () => {
    const candidate = { ...LEVELS[7], startGold: 285, hpScale: 1.3, feat: { kind: 'maxTowers', limit: 1000 } } as const;
    const row = checkLevel(candidate, { band: 'late', introduces: null });
    expect(row.featTrials?.map(trial => trial.good.stars)).toEqual([3, 1, 1, 1, 3]);
    expect(row.failed).toContain('F1');
  }, 90_000);

  it('level 15: the deliberate run keeps three stars with 10 less starting gold', () => {
    expect(deliberate(15, l => ({ ...l, startGold: l.startGold - 10 })).stars).toBe(3);
  }, 60_000);

  it('level 13: the deliberate run keeps three stars at HP x1.02', () => {
    expect(deliberate(13, l => ({ ...l, hpScale: l.hpScale * 1.02 })).stars).toBe(3);
  }, 60_000);
});

describe('the gate on a free feat and on tax ranges', () => {
  it('a feat that ordinary Good and Person both earn is rejected by the level check', () => {
    const free = { ...LEVELS[3], id: 904, feat: { kind: 'maxTowers', limit: 1000 } } as const;
    expect(checkLevel(free, CAMPAIGN_CONTEXTS[3]).failed).toEqual(expect.arrayContaining(['F2', 'F3']));
  }, 120_000);

  it('every tax number just outside its scope range is refused before any game is run (as L7)', () => {
    const outside: LevelTaxes[] = [
      { windowTax: 0.04 }, { windowTax: 0.11 }, { forcedMarch: 0.14 }, { forcedMarch: 0.26 },
      { curfew: 0.09 }, { curfew: 0.21 }, { noLoitering: 7.9 }, { noLoitering: 15.1 },
      { rationing: 0 }, { frozenPurse: -1 }, { windowTax: Number.NaN },
      { bogus: 1 } as unknown as LevelTaxes,
    ];
    for (const taxes of outside) expect(checkLevel({ ...LEVELS[13], taxes }, CAMPAIGN_CONTEXTS[13]).failed, JSON.stringify(taxes)).toEqual(['L7']);
  });
});
