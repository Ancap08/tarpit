import { describe, expect, it } from 'vitest';
import { comboBuild, createGame, playAllWavesNoTowers, playScripted } from '../../sim';
import { endKind, endScreenText } from './endText';

describe('end screen text', () => {
  it('no end screen while the game is going', () => {
    const s = createGame();
    expect(endKind(s)).toBeNull();
    s.phase = 'wave';
    expect(endKind(s)).toBeNull();
  });

  it('win: lives and gold left', () => {
    const s = playScripted(comboBuild()).state;
    expect(endKind(s)).toBe('won');
    expect(endScreenText('won', s)).toEqual({
      title: 'Victory!',
      lines: ['The village stands. Lives left: 11', 'Gold left: 177'],
    });
  });

  it('lose: the wave reached', () => {
    const s = playAllWavesNoTowers();
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({ title: 'The village fell', lines: ['Reached wave 2 of 10'] });
  });
});
