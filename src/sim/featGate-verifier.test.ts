// Milestone 48 verifier. F1 measures the deliberate run at nominal only. The first ten levels are
// held to the same two-percent and ten-gold nudges (L1m); the feats are not. These two shipped
// levels earn their feat at nominal and lose it under a nudge that is well inside a player's slop.
import { describe, expect, it } from 'vitest';
import { LEVELS, createGame, levelStars, runBot, type LevelTaxes } from '.';
import { CAMPAIGN_CONTEXTS } from './campaignContexts';
import { checkLevel } from './checkLevel';
import { botGoodFeat } from './bots';

const deliberate = (id: number, edit: (level: (typeof LEVELS)[number]) => (typeof LEVELS)[number]) => {
  const { state } = runBot(createGame({ level: edit(LEVELS[id - 1]) }), botGoodFeat, Infinity, 3600 * 60);
  return { stars: levelStars(state), lives: Math.max(0, state.lives) };
};

describe('F1 holds only at nominal', () => {
  it('level 13 (Not a penny) and 15 (Bare hands) earn their feat at nominal', () => {
    expect(deliberate(13, l => l)).toEqual({ stars: 3, lives: 20 });
    expect(deliberate(15, l => l)).toEqual({ stars: 3, lives: 13 });
  }, 60_000);

  // DEFECT (gate gap): F1 would pass a level whose feat run falls apart at gold -10 or HP +2%.
  // Measured 2026-11-24: level 15 at 135 gold: 1 star, 5 lives; level 13 at HP x1.02: 2 stars, 18 lives.
  // When F1 learns the five-point nudge, these two start passing and `it.fails` turns red: change to `it`.
  it.fails('level 15: the deliberate run keeps three stars with 10 less starting gold', () => {
    expect(deliberate(15, l => ({ ...l, startGold: l.startGold - 10 })).stars).toBe(3);
  }, 60_000);

  it.fails('level 13: the deliberate run keeps three stars at HP x1.02', () => {
    expect(deliberate(13, l => ({ ...l, hpScale: l.hpScale * 1.02 })).stars).toBe(3);
  }, 60_000);
});

describe('the gate on a free feat and on tax ranges', () => {
  // DEFECT (gate gap): checkLevel alone accepts a feat that ordinary Good AND Person both earn,
  // because the per-level F1 only asks that deliberate Good earns it and Beginner does not. Only
  // checkCampaign's "at most half of the feats" notices, and only with ten feats to count.
  // Measured: level 4 with "Few hands: at most 1000" passes with failed = [] (Good 3 stars, Person 3 stars).
  // Fixing it makes this pass: change `it.fails` to `it`.
  it.fails('a feat that ordinary Good and Person both earn is rejected by the level check', () => {
    const free = { ...LEVELS[3], id: 904, feat: { kind: 'maxTowers', limit: 1000 } } as const;
    expect(checkLevel(free, CAMPAIGN_CONTEXTS[3]).failed).toContain('F1');
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
