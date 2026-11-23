import { afterEach, describe, expect, it, vi } from 'vitest';
import * as bots from './bots';
import { checkCampaign, checkLevel } from './checkLevel';
import type { LevelDef } from './levelTypes';
import { LEVELS } from './levels';

const base: LevelDef = {
  id: 1, map: 'meadow', startGold: 100, hpScale: 1, hpGrowthStart: null,
  allowedTowers: ['musketeer', 'longbow'], maxTowerLevel: 2, allowedSpecials: ['keg'], rewardWaves: [],
  waves: Array.from({ length: 6 }, () => ({ groups: [{ type: 'goblin', count: 24, interval: 2.5, delay: 0 }] })),
};
const withTarPit = { ...base, id: 3, allowedTowers: [...base.allowedTowers, 'tarpit' as const] };
const specialFeature = { specials: ['keg'] } as const;

afterEach(() => vi.restoreAllMocks());

/** Fix outcomes for acceptance boundary tests while retaining level validation. */
function stubBots(livesFor: (level: LevelDef, beginner: boolean) => number): void {
  vi.spyOn(bots, 'runBot').mockImplementation((state, bot) => {
    const level = state.level!;
    const lives = livesFor(level, bot === bots.botBeginner);
    state.lives = lives;
    state.phase = lives > 0 ? 'won' : 'lost';
    state.tick = 6 * 60 * 60;
    return { state, log: [], refused: 0 };
  });
}

function stubCampaign(lives: readonly number[]): LevelDef[] {
  stubBots((level, beginner) => {
    if (beginner) return level.id <= 3 ? 4 : 0;
    if (!level.allowedSpecials.includes('keg')) return 0;
    return lives[level.id - 1] + (level.startGold - 100);
  });
  return Array.from({ length: 10 }, (_, i) => ({ ...base, id: i + 1, startGold: 100 }));
}

describe('campaign acceptance gate', () => {
  it.each(LEVELS)('accepts shipped level $id', (level) => {
    const result = checkLevel(level);
    expect(result.failed).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('accepts the combined length and difficulty slope of the ten levels', () => {
    const result = checkCampaign(LEVELS);
    expect(result.levels.map(row => row.failed)).toEqual(LEVELS.map(() => []));
    expect(result.failed).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('rejects a first level whose enemies are much too strong', () => {
    const result = checkLevel({ ...LEVELS[0], startGold: 100, hpScale: 25 });
    expect(result.failed).toEqual(['L1', 'L2', 'L5']);
    expect(result.good?.phase).toBe('lost');
  });

  it('L2 rejects a trivial later level', () => {
    const result = checkLevel({ ...LEVELS[4], hpScale: 0.3, startGold: 300 });
    expect(result.failed).toEqual(['L2']);
    expect(result.beginner?.stars).toBe(3);
  });

  it.each([4, 5])('L2 permits a Beginner loss or two-star win on level %i', (id) => {
    stubBots((level, beginner) => beginner ? level.startGold - 100 : 18);
    for (const gold of [100, 112, 117]) {
      expect(checkLevel({ ...base, id, startGold: gold }).failed).not.toContain('L2');
    }
    expect(checkLevel({ ...base, id, startGold: 118 }).failed).toContain('L2');
  });

  it.each([6, 10])('L2 limits Beginner to one star on level %i', (id) => {
    stubBots((level, beginner) => beginner ? level.startGold - 100 : 15);
    expect(checkLevel({ ...base, id, startGold: 111 }).failed).not.toContain('L2');
    expect(checkLevel({ ...base, id, startGold: 112 }).failed).toContain('L2');
  });

  it('L3 rejects a level when removing its featured tower makes no difference', () => {
    const result = checkLevel({ ...LEVELS[2], hpScale: 0.8 });
    expect(result.failed).toEqual(['L3']);
    expect(result.good?.lives).toBe(result.forbidden?.lives);
    expect(result.good?.stars).toBe(result.forbidden?.stars);
  });

  it('L3 requires an explicit feature for additional campaign stops', () => {
    stubBots((level, beginner) => beginner ? 3 : level.allowedTowers.includes('tarpit') ? 17 : 15);
    const candidate = { ...withTarPit, id: 11 };
    expect(checkLevel(candidate).failed).toEqual(['L3']);
    expect(checkLevel(candidate, { towers: ['tarpit'] }).failed).toEqual([]);
  });

  it('L4 rejects a jump of more than one beginner star', () => {
    stubBots((level, beginner) => beginner ? level.id === 1 ? 12 : 0 : 18);
    const first = { ...base, id: 1 };
    expect(checkLevel(first, undefined, [{ ...base, id: 4 }, first]).failed).toContain('L4');
  });

  it('L4 rejects two consecutive increases in the capable bot’s lives, including a contextual replacement', () => {
    const entries = stubCampaign([18, 18, 18, 15, 16, 17, 17, 15, 15, 15]).slice(3, 6);
    const features = Object.fromEntries(entries.map(level => [level.id, specialFeature]));
    const result = checkCampaign(entries, features);
    expect(result.levels.map(row => row.failed)).toEqual([[], [], ['L4']]);
    expect(checkLevel(entries[1], specialFeature, entries).failed).toContain('L4');
  });

  it('L5 rejects schedules over the spawn rate or last spawn limit before running bots', () => {
    const check = (count: number, interval: number, delay = 0) => checkLevel({
      ...base,
      waves: [{ groups: [{ type: 'goblin', count, interval, delay }] }, ...base.waves.slice(1)],
    });
    for (const result of [check(7, 0.49), check(2, 60, 31)]) {
      expect(result.failed).toEqual(['L5']);
      expect(result.good).toBeUndefined();
    }
  });

  it('L5 rejects a campaign context with too little total play time', () => {
    expect(checkLevel(base, undefined, [base]).failed).toEqual(['L5']);
  });

  it('L6 rejects a five-percent HP increase that costs Good two stars', () => {
    stubBots((level, beginner) => beginner ? 1 : level.hpScale > 1 ? 11 : 18);
    const result = checkLevel({ ...base, hpScale: 1 });
    expect(result.failed).toEqual(['L6']);
    expect(result.good?.stars).toBe(3);
    expect(result.higherHp?.stars).toBe(1);
  });

  it('L7 rejects malformed data and starting gold outside 100–300', () => {
    for (const candidate of [
      { ...base, hpScale: Infinity }, { ...base, waves: [] },
      { ...base, startGold: 99 }, { ...base, startGold: 301 },
    ]) {
      const result = checkLevel(candidate);
      expect(result.failed).toEqual(['L7']);
      expect(result.good).toBeUndefined();
    }
    for (const startGold of [100, 300]) {
      expect(checkLevel({ ...base, startGold }).good).toBeDefined();
    }
  });

  it.each([[0, false], [11, false], [12, true], [16, true], [17, false]] as const)(
    'L8 accepts finale Good lives %i = %s',
    (lives, accepted) => {
      stubBots((level, beginner) => beginner || !level.allowedSpecials.includes('keg') ? 0 : lives);
      const result = checkLevel({ ...base, id: 10, allowedSpecials: ['keg'] });
      expect(result.failed.includes('L8')).toBe(!accepted);
      expect(result.good?.lives).toBe(lives);
    },
  );

  it('L8 accepts exactly three fewer average lives and checks contextual replacements', () => {
    const entries = stubCampaign([20, 19, 18, 17, 17, 17, 16, 16, 16, 16]);
    expect(checkCampaign(entries).failed).not.toContain('L8');
    const candidate = { ...entries[7], startGold: 101 };
    expect(checkLevel(candidate, specialFeature).failed).not.toContain('L8');
    expect(checkLevel(candidate, specialFeature, entries).failed).toContain('L8');
    const replacement = entries.map(level => level.id === candidate.id ? candidate : level);
    expect(checkCampaign(replacement).failed).toContain('L8');
  });

  it('L8 rejects a full campaign with a missing cohort level', () => {
    const entries = stubCampaign([20, 19, 18, 17, 17, 17, 16, 16, 16, 16]);
    entries[7] = { ...entries[7], id: 11 };
    expect(checkCampaign(entries).failed).toContain('L8');
  });
});
