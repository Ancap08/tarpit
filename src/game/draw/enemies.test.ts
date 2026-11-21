import { describe, expect, it } from 'vitest';
import { COLORS } from '../palette';
import { hpColor, statusRings } from './enemies';

describe('hp bar colour', () => {
  it('is green from full down to half, orange below half, red below a quarter', () => {
    expect(hpColor(1)).toBe(COLORS.hpFill);
    expect(hpColor(0.5)).toBe(COLORS.hpFill);
    expect(hpColor(0.49)).toBe(COLORS.hpMid);
    expect(hpColor(0.25)).toBe(COLORS.hpMid);
    expect(hpColor(0.24)).toBe(COLORS.hpLow);
    expect(hpColor(0)).toBe(COLORS.hpLow);
  });
});

describe('status rings', () => {
  it('shows tar, burn, or both with the orange burn ring outside the tar ring', () => {
    expect(statusRings({ slowTicksLeft: 0 })).toEqual([]);
    expect(statusRings({ slowTicksLeft: 0, burnTicksLeft: 0 })).toEqual([]);
    expect(statusRings({ slowTicksLeft: 5 })).toEqual([{ color: COLORS.tarRing, offset: 3 }]);
    expect(statusRings({ slowTicksLeft: 0, burnTicksLeft: 9 })).toEqual([{ color: COLORS.burnRing, offset: 3 }]);
    expect(statusRings({ slowTicksLeft: 5, burnTicksLeft: 9 })).toEqual([
      { color: COLORS.tarRing, offset: 3 },
      { color: COLORS.burnRing, offset: 6 },
    ]);
  });
});
