import { describe, expect, it } from 'vitest';
import { introductionMatches, ramTrial, repairedFeatForfeited } from './checkKeep';
import { KEEP_LEVELS } from './keepLevels';

describe('Act Three gate controls', () => {
  it('detects windows on the opening stop and a second road arriving early', () => {
    const [rent, beds, roads] = KEEP_LEVELS;
    expect(KEEP_LEVELS.every(introductionMatches)).toBe(true);
    expect(introductionMatches({ ...rent, windows: beds.windows }, 0)).toBe(false);
    expect(introductionMatches({ ...beds, waves: roads.waves }, 1)).toBe(false);
  });

  it('reports whether the real finale Ram breaks the gate before the Fire Pot kills it', () => {
    const level = KEEP_LEVELS[4];
    expect(ramTrial(level, false)).toMatchObject({ fell: true, ended: true });
    expect(ramTrial(level, true)).toMatchObject({ fell: false, ended: true, feathered: true });
    expect(ramTrial({ ...level, gate: { ...level.gate, ramGateDps: 4 } }, false)).toMatchObject({ fell: false });
  });

  it('takes Not a nail away after a paid repair, including a partial step', () => {
    expect(repairedFeatForfeited(KEEP_LEVELS[1])).toBe(true);
    expect(repairedFeatForfeited(KEEP_LEVELS[3])).toBe(true);
    expect(repairedFeatForfeited(KEEP_LEVELS[0])).toBe(false);
  });
});
