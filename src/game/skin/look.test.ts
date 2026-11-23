import { describe, expect, it } from 'vitest';
import { LOOK_KEY, LookStore, paintedDensity } from './look';

function storage(initial?: string) {
  const values = new Map(initial === undefined ? [] : [[LOOK_KEY, initial]]);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('Look preference', () => {
  it('defaults to Painted and ignores unknown stored or URL values', () => {
    expect(new LookStore(() => storage(), '').get()).toBe('painted');
    expect(new LookStore(() => storage('other'), '?look=other').get()).toBe('painted');
    expect(new LookStore(() => storage('classic'), '').get()).toBe('classic');
    expect(new LookStore(() => storage('painted'), '?look=other').get()).toBe('painted');
  });

  it('uses Classic in test mode unless storage or the URL selects Painted', () => {
    expect(new LookStore(() => storage(), '?test=1').get()).toBe('classic');
    expect(new LookStore(() => storage('painted'), '?test=1').get()).toBe('painted');
    expect(new LookStore(() => storage('classic'), '?test=1&look=painted').get()).toBe('painted');
    expect(new LookStore(() => storage(), '?test=0').get()).toBe('painted');
  });

  it('takes a visit override without replacing the stored choice', () => {
    const store = storage('painted');
    expect(new LookStore(() => store, '?look=classic').get()).toBe('classic');
    expect(store.getItem(LOOK_KEY)).toBe('painted');
    expect(new LookStore(() => store, '').get()).toBe('painted');
  });

  it('persists an explicit choice even when the visit had an override', () => {
    const store = storage('classic');
    const look = new LookStore(() => store, '?look=painted');
    look.set('painted');
    expect(new LookStore(() => store, '').get()).toBe('painted');
  });

  it('remembers an explicit choice in memory when storage throws', () => {
    const look = new LookStore(() => { throw new Error('blocked'); }, '');
    expect(look.get()).toBe('painted');
    look.set('classic');
    expect(look.get()).toBe('classic');
  });
});

describe('Painted asset density', () => {
  it('uses the displayed canvas scale and device pixel ratio together', () => {
    expect(paintedDensity(1, 1.499)).toBe(1);
    expect(paintedDensity(1, 1.5)).toBe(2);
    expect(paintedDensity(0.74, 2)).toBe(1);
    expect(paintedDensity(0.75, 2)).toBe(2);
    expect(paintedDensity(0.5, 3)).toBe(2);
    expect(paintedDensity(1.5, 1)).toBe(2);
  });
});
