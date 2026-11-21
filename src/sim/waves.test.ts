import { describe, expect, it } from 'vitest';
import { createGame } from './game';
import { nextWavePreview, WAVES } from './waves';

describe('waves', () => {
  it('has 10 waves', () => {
    expect(WAVES).toHaveLength(10);
  });

  it('previews wave 1 before the game starts', () => {
    const state = createGame();
    expect(nextWavePreview(state)).toEqual([{ type: 'goblin', count: 8 }]);
  });

  it('previews wave 3 after wave 2', () => {
    const state = { ...createGame(), wave: 2 };
    expect(nextWavePreview(state)).toEqual([
      { type: 'goblin', count: 8 },
      { type: 'wolf', count: 5 },
    ]);
  });

  it('previews nothing after wave 10', () => {
    const state = { ...createGame(), wave: 10 };
    expect(nextWavePreview(state)).toEqual([]);
  });
});
