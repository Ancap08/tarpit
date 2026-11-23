import { describe, expect, it } from 'vitest';
import { comboBuild, createGame, endlessIdle, playAllWavesNoTowers, playScripted } from '../../sim';
import { BOON_NAMES, END_TEXT } from '../names';
import { endKind, endScreenText } from './endText';

describe('end screen text', () => {
  it('no end screen while the game is going', () => {
    const s = createGame();
    expect(endKind(s)).toBeNull();
    s.phase = 'wave';
    expect(endKind(s)).toBeNull();
  });

  it('win: lives, gold and held boons', () => {
    const s = playScripted(comboBuild()).state;
    expect(endKind(s)).toBe('won');
    expect(endScreenText('won', s)).toEqual({
      title: END_TEXT.wonTitle,
      lines: [`${END_TEXT.wonLives} 19`, `${END_TEXT.wonGold} 2847`],
      boons: `Rewards: ${BOON_NAMES.longBarrels} · ${BOON_NAMES.stickyTar} · ${BOON_NAMES.stoneWalls}`,
    });
  });

  it('lose: the wave reached', () => {
    const s = playAllWavesNoTowers();
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({ title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} 1 of 20`], boons: '' });
  });

  it('endless loss: the wave reached and held boons', () => {
    const s = playScripted(endlessIdle()).state;
    expect([s.phase, s.endless, s.wave]).toEqual(['lost', true, 24]);
    expect(endScreenText('lost', s)).toEqual({
      title: END_TEXT.lostTitle,
      lines: [`${END_TEXT.lostWave} 24`],
      boons: `Rewards: ${BOON_NAMES.longBarrels} · ${BOON_NAMES.stickyTar} · ${BOON_NAMES.stoneWalls}`,
    });
  });
});
