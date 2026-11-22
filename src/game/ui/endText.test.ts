import { describe, expect, it } from 'vitest';
import { comboBuild, createGame, playAllWavesNoTowers, playScripted } from '../../sim';
import { END_TEXT } from '../names';
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
      title: END_TEXT.wonTitle,
      lines: [`${END_TEXT.wonLives} 13`, `${END_TEXT.wonGold} 476`],
    });
  });

  it('lose: the wave reached', () => {
    const s = playAllWavesNoTowers();
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({ title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} 1 of 10`] });
  });
});
