import { describe, expect, it } from 'vitest';
import { COLORS } from '../palette';
import { hpColor } from './enemies';

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
