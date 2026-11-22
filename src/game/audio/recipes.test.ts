import { describe, expect, it } from 'vitest';
import { deathSound, HEADROOM, peakBound, RECIPES, recipeLength, SOUND_NAMES, type SoundName } from './recipes';

/** The stated length limits (docs/DESIGN.md "Sound"): 0.6 s unless noted. */
const LIMIT: Partial<Record<SoundName, number>> = {
  waveStart: 0.75,
  'special.keg': 0.8,
  bossArrive: 1.5,
  bossFall: 1.5,
  win: 2,
  lose: 2,
};

describe('recipes', () => {
  it('every sound has a recipe and every recipe a name', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...SOUND_NAMES].sort());
  });

  it.each(SOUND_NAMES)('%s keeps its length limit and the headroom rule', (name) => {
    const r = RECIPES[name];
    expect(recipeLength(r)).toBeGreaterThan(0.015);
    expect(recipeLength(r)).toBeLessThanOrEqual(LIMIT[name] ?? 0.6);
    expect(peakBound(r)).toBeLessThanOrEqual(HEADROOM);
    for (const l of r.layers) {
      expect(l.env.a).toBeGreaterThan(0);
      expect(l.env.d).toBeGreaterThan(0);
      expect(l.filter?.q ?? 0.707).toBeLessThanOrEqual(1.2);
    }
  });

  it('the boss sounds and jingles are the longest, the hit tick the quietest', () => {
    const len = (n: SoundName) => recipeLength(RECIPES[n]);
    const others = SOUND_NAMES.filter((n) => !['bossArrive', 'bossFall', 'win', 'lose'].includes(n));
    for (const n of others) expect(len(n)).toBeLessThan(len('bossFall'));
    for (const n of SOUND_NAMES) if (n !== 'hit') expect(peakBound(RECIPES[n])).toBeGreaterThan(peakBound(RECIPES.hit));
  });

  it('death pops fall in pitch with size', () => {
    expect(deathSound('goblin')).toBe('death.small');
    expect(deathSound('harpy')).toBe('death.small');
    expect(deathSound('wolf')).toBe('death.medium');
    expect(deathSound('shieldbearer')).toBe('death.medium');
    expect(deathSound('troll')).toBe('death.large');
    const f0 = (n: SoundName) => (RECIPES[n].layers[0].kind === 'tone' ? RECIPES[n].layers[0].f0 : 0);
    expect(f0('death.small')).toBeGreaterThan(f0('death.medium'));
    expect(f0('death.medium')).toBeGreaterThan(f0('death.large'));
    expect(f0('death.large')).toBeGreaterThan(f0('bossFall'));
  });
});
