// Milestone 42 verifier probes for the campaign result text and the tips table.
import { describe, expect, it } from 'vitest';
import { LEVELS, createGame } from '../sim';
import { allowedTowers, availableSpecials, maxTowerLevel } from '../sim';
import { LEVEL_TIPS } from './names';
import { campaignResultText } from './ui/endText';

const level = (id: number) => LEVELS.find(l => l.id === id)!;

describe('milestone 42 result text', () => {
  it('the result of a cheated win offers Next level only while a next level exists; level 10 says complete', () => {
    const result = (id: number, phase: 'won' | 'lost', progress = {}) => {
      const state = createGame({ level: level(id) });
      state.phase = phase;
      state.lives = phase === 'won' ? 20 : 0;
      state.cheated = true;
      return campaignResultText(state, progress);
    };
    expect(result(1, 'won', { 1: 0 })).toMatchObject({ stars: 0, nextId: 2 });
    expect(result(1, 'won', {})).toMatchObject({ nextId: null });
    expect(result(1, 'lost')).toMatchObject({ stars: 0, nextId: null });
    expect(result(10, 'won', { 10: 0 })).toMatchObject({ stars: 0, nextId: null });
    expect(result(10, 'won', { 10: 0 })!.complete).not.toBe('');
  });
});

describe('milestone 42 tips use only gear the level allows', () => {
  it('names only towers, specials and upgrades that are open on that level without the cheat', () => {
    const open = (id: number) => {
      const state = createGame({ level: level(id) });
      state.wave = 1;
      return { towers: allowedTowers(state), specials: availableSpecials(state), tier: maxTowerLevel(state) };
    };
    // Gear each tip names, by level (read from the lines in names.ts).
    expect(open(2).towers).toContain('cannon');
    expect(open(3).towers).toContain('tarpit');
    expect(open(4).towers).toEqual(expect.arrayContaining(['tarpit', 'firepot']));
    expect(open(5).towers).toEqual(expect.arrayContaining(['longbow', 'musketeer', 'firepot']));
    expect(open(5).specials).toContain('tarBarrel');
    expect(open(6).towers).toContain('mortar');
    expect(open(7).specials).toContain('barricade');
    expect(open(8).specials).toEqual(expect.arrayContaining(['guards', 'fireArrows']));
    expect(open(9).tier).toBe(3);
    expect(open(10).specials).toContain('keg');
    expect(open(10).towers).toEqual(expect.arrayContaining(['tarpit', 'firepot']));
    expect(Object.keys(LEVEL_TIPS)).toHaveLength(LEVELS.length);
  });
});
