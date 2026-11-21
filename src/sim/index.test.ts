import { describe, expect, it } from 'vitest';
import { clamp } from './index';

describe('clamp', () => {
  it('returns the value when inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('returns lo when below the range', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('returns hi when above the range', () => {
    expect(clamp(42, 0, 10)).toBe(10);
  });

  it('includes the bounds', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
