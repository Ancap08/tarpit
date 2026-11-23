import { describe, expect, it } from 'vitest';
import { createGame, LEVELS } from '../../sim';
import { BAR_TYPES, canPick } from './buildBarModel';

describe('build bar picks', () => {
  it('keeps every slot and allows only the first level’s two towers, regardless of gold', () => {
    const state = createGame({ level: LEVELS[0] });
    state.gold = 1000;
    expect(BAR_TYPES).toEqual(['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot']);
    expect(BAR_TYPES.filter(type => canPick(state, type))).toEqual(['musketeer', 'longbow']);
    state.gold = 0;
    expect(BAR_TYPES.some(type => canPick(state, type))).toBe(false);
  });

  it('allows all six affordable towers in the last level and Free play', () => {
    for (const state of [createGame({ level: LEVELS.at(-1) }), createGame()]) {
      state.gold = 1000;
      expect(BAR_TYPES.every(type => canPick(state, type))).toBe(true);
    }
  });
});
