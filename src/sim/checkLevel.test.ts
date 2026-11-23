import { describe, expect, it } from 'vitest';
import { checkCampaign, checkLevel } from './checkLevel';
import { LEVELS } from './levels';

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

  it('L1 rejects a first level whose enemies are much too strong', () => {
    const result = checkLevel({ ...LEVELS[0], hpScale: 25 });
    expect(result.ok).toBe(false);
    expect(result.failed).toContain('L1');
    expect(result.good?.phase).toBe('lost');
  });

  it('L2 rejects a trivial later level', () => {
    const result = checkLevel({ ...LEVELS[4], hpScale: 0.3, startGold: 600 });
    expect(result.failed).toEqual(['L2']);
    expect(result.beginner?.stars).toBe(3);
  });

  it('L3 rejects a level when removing its featured tower makes no difference', () => {
    const result = checkLevel({ ...LEVELS[2], hpScale: 0.8 });
    expect(result.failed).toEqual(['L3']);
    expect(result.good?.lives).toBe(result.forbidden?.lives);
    expect(result.good?.stars).toBe(result.forbidden?.stars);
  });

  it('L3 requires an explicit feature for additional campaign stops', () => {
    const candidate = { ...LEVELS[2], id: 11 };
    expect(checkLevel(candidate).failed).toContain('L3');
    expect(checkLevel(candidate, { towers: ['tarpit'] }).failed).not.toContain('L3');
  });

  it('L4 rejects a jump of more than one beginner star', () => {
    const result = checkLevel(LEVELS[0], undefined, [LEVELS[3], LEVELS[0]]);
    expect(result.failed).toContain('L4');
  });

  it('L4 rejects two consecutive increases in the capable bot’s lives fraction', () => {
    const result = checkCampaign([LEVELS[8], LEVELS[6], LEVELS[7]]);
    expect(result.levels.map(row => row.failed)).toEqual([[], [], ['L4']]);
  });

  it('L4 rejects a candidate that creates a rising streak ending in a later level', () => {
    const result = checkLevel(LEVELS[6], undefined, [LEVELS[8], LEVELS[6], LEVELS[7]]);
    expect(result.failed).toContain('L4');
  });

  it('L5 rejects schedules over the spawn rate or last spawn limit before running bots', () => {
    const level = LEVELS[0];
    const check = (count: number, interval: number, delay = 0) => checkLevel({
      ...level,
      waves: [{ groups: [{ type: 'goblin', count, interval, delay }] }, ...level.waves.slice(1)],
    });
    for (const result of [check(7, 0.49), check(2, 60, 31)]) {
      expect(result.failed).toEqual(['L5']);
      expect(result.good).toBeUndefined();
    }
  });

  it('L5 rejects a campaign context with too little total play time', () => {
    expect(checkLevel(LEVELS[0], undefined, [LEVELS[0]]).failed).toEqual(['L5']);
  });

  it('L6 rejects star thresholds that make a five-percent HP increase cost two stars', () => {
    const result = checkLevel({ ...LEVELS[3], stars: { two: 20, three: 21 } });
    expect(result.failed).toEqual(['L6']);
    expect(result.good?.stars).toBe(3);
    expect(result.higherHp?.stars).toBe(1);
  });

  it('L7 rejects non-finite numbers and an empty level before running bots', () => {
    const level = LEVELS[0];
    for (const candidate of [{ ...level, hpScale: Infinity }, { ...level, waves: [] }]) {
      const result = checkLevel(candidate);
      expect(result.failed).toEqual(['L7']);
      expect(result.good).toBeUndefined();
    }
  });
});
