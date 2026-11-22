import { describe, expect, it } from 'vitest';
import { deathSound, EXIT_THIN_MS, LEVEL_TIERS, levelTier, LOW_SOUNDS, RECIPES, recipeLength, SMALL_THIN_MS, SOUND_NAMES, type SoundName } from './recipes';

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

  it.each(SOUND_NAMES)('%s keeps its length limit and gentle filters', (name) => {
    const r = RECIPES[name];
    expect(recipeLength(r)).toBeGreaterThan(0.015);
    expect(recipeLength(r)).toBeLessThanOrEqual(LIMIT[name] ?? 0.6);
    for (const l of r.layers) {
      expect(l.env.a).toBeGreaterThan(0);
      expect(l.env.d).toBeGreaterThan(0);
      expect(l.filter?.q ?? 0.707).toBeLessThanOrEqual(1.2);
    }
  });

  it('the boss sounds and jingles are the longest', () => {
    const len = (n: SoundName) => recipeLength(RECIPES[n]);
    const others = SOUND_NAMES.filter((n) => !['bossArrive', 'bossFall', 'win', 'lose'].includes(n));
    for (const n of others) expect(len(n)).toBeLessThan(len('bossFall'));
  });

  it('the level tiers rise: ticks under shots under impacts, moments under big moments', () => {
    const t = LEVEL_TIERS;
    expect(t.tick[1]).toBeLessThan(t.shot[0]);
    expect(t.shot[1]).toBeLessThan(t.impact[0]);
    expect(t.impact[1]).toBeLessThanOrEqual(t.moment[0]);
    expect(t.moment[1]).toBeLessThanOrEqual(t.big[0]);
    expect(levelTier('hit')).toBe('tick');
    expect(levelTier('shot.firepot')).toBe('shot');
    expect(levelTier('death.large')).toBe('impact');
    expect(levelTier('coin')).toBe('action');
    expect(levelTier('waveStart')).toBe('moment');
    expect(levelTier('special.keg')).toBe('big');
    expect(levelTier('bossFall')).toBe('big');
  });

  it('the smallest sounds and the exit warning thin over a longer window', () => {
    for (const n of ['hit', 'impact.musketeer', 'death.small'] as const) expect(RECIPES[n].thin).toBe(SMALL_THIN_MS);
    expect(RECIPES.exit.thin).toBe(EXIT_THIN_MS);
    expect(SOUND_NAMES.filter((n) => RECIPES[n].thin !== undefined).sort()).toEqual(['death.small', 'exit', 'hit', 'impact.musketeer']);
  });

  it('every low sound has a mid layer (200 to 900 Hz) for small speakers', () => {
    for (const n of LOW_SOUNDS) {
      const mid = RECIPES[n].layers.some((l) =>
        l.kind === 'tone' ? l.f0 >= 200 && l.f0 <= 900 && l.wave !== 'sine' : l.filter?.type === 'bandpass' && l.filter.f0 >= 200 && l.filter.f0 <= 900,
      );
      expect(mid, n).toBe(true);
    }
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
