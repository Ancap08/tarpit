import { describe, expect, it } from 'vitest';
import { comboBuild, createGame, endlessIdle, playAllWavesNoTowers, playScripted } from '../../sim';
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
      lines: [`${END_TEXT.wonLives} 14`, `${END_TEXT.wonGold} 484`],
    });
  });

  it('lose: the wave reached', () => {
    const s = playAllWavesNoTowers();
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({ title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} 1 of 10`] });
  });

  it('lose in an endless game (milestone 26): the wave reached, no "of 10"', () => {
    const s = playScripted(endlessIdle()).state;
    expect([s.phase, s.endless, s.wave]).toEqual(['lost', true, 14]);
    expect(endScreenText('lost', s)).toEqual({ title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} 14`] });
  });
});
