import { describe, expect, it } from 'vitest';
import { createGame, LEVELS, playAllWavesNoTowers } from '../../sim';
import { BOON_NAMES, CAMPAIGN_END, END_TEXT, LEVEL_STORY, STORY_TEXT } from '../names';
import { campaignResultText, endKind, endScreenText } from './endText';

describe('end screen text', () => {
  it('no end screen while the game is going', () => {
    const s = createGame();
    expect(endKind(s)).toBeNull();
    s.phase = 'wave';
    expect(endKind(s)).toBeNull();
  });

  it('win: lives, gold and held boons', () => {
    const s = createGame();
    s.phase = 'won';
    s.wave = 20;
    s.lives = 17;
    s.gold = 2451;
    s.boons = ['longBarrels', 'stickyTar', 'stoneWalls'];
    expect(endKind(s)).toBe('won');
    expect(endScreenText('won', s)).toEqual({
      title: END_TEXT.wonTitle,
      lines: [`${END_TEXT.wonLives} 17`, `${END_TEXT.wonGold} 2451`],
      boons: `Rewards: ${BOON_NAMES.longBarrels} · ${BOON_NAMES.stickyTar} · ${BOON_NAMES.stoneWalls}`,
    });
  });

  it('lose: the wave reached', () => {
    const s = playAllWavesNoTowers();
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({ title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} 1 of 20`], boons: '' });
  });

  it('endless loss: the wave reached and held boons', () => {
    const s = createGame();
    s.phase = 'lost';
    s.endless = true;
    s.wave = 25;
    s.boons = ['longBarrels', 'stickyTar', 'stoneWalls'];
    expect(endKind(s)).toBe('lost');
    expect(endScreenText('lost', s)).toEqual({
      title: END_TEXT.lostTitle,
      lines: [`${END_TEXT.lostWave} 25`],
      boons: `Rewards: ${BOON_NAMES.longBarrels} · ${BOON_NAMES.stickyTar} · ${BOON_NAMES.stoneWalls}`,
    });
  });
});

describe('campaign result', () => {
  it.each([
    [1, 1, '1 of 3 stars', 'Finish with 12 lives for two stars'],
    [12, 2, '2 of 3 stars', 'Finish with 18 lives for three stars'],
    [18, 3, '3 of 3 stars', ''],
  ] as const)('shows this run with %i lives, even after a better win', (lives, stars, slots, hint) => {
    const state = createGame({ level: LEVELS[0] });
    state.phase = 'won';
    state.lives = lives;
    const result = campaignResultText(state, { 1: 3 });
    expect(result).toMatchObject({
      kind: 'won', levelId: 1, lives, stars, slots, hint, complete: '', nextId: 2,
      buttons: ['Next level', 'Play again', 'Level map'],
    });
    expect(result?.details).toContain(`Lives left: ${lives}`);
  });

  it('keeps the town reply and closes Act One on a win at stop ten', () => {
    const state = createGame({ level: LEVELS[9] });
    state.phase = 'won';
    const progress = Object.fromEntries(LEVELS.slice(0, 10).map(level => [level.id, 2] as const));
    expect(campaignResultText(state, progress)).toMatchObject({
      levelId: 10, complete: '', actClose: STORY_TEXT.firstActClose, story: LEVEL_STORY[10].reply, nextId: 11,
    });
    state.phase = 'lost';
    expect(campaignResultText(state, progress)).toMatchObject({ complete: '', actClose: '', nextId: null });
  });

  it('celebrates the last level and has no next button', () => {
    const state = createGame({ level: LEVELS.at(-1)! });
    state.phase = 'won';
    expect(campaignResultText(state, {})).toMatchObject({
      levelId: 20, story: LEVEL_STORY[20].reply, actClose: '', complete: 'Campaign complete!', nextId: null, buttons: ['Play again', 'Level map'],
    });
  });

  it('prints this run’s feat, including missed, lost and cheated finishes', () => {
    const state = createGame({ level: LEVELS[10] });
    state.phase = 'won';
    const progress = Object.fromEntries(LEVELS.slice(0, 11).map(level => [level.id, 3] as const));
    const missed = 'Missed Bare hands: win without using a special.';
    expect(campaignResultText(state, progress)).toMatchObject({
      slots: '3 of 3 stars', feat: 'Earned: Bare hands.', nextId: 12,
    });
    state.lastSpecialTick = 0;
    expect(campaignResultText(state, progress)).toMatchObject({ stars: 2, feat: missed, hint: '' });
    delete state.lastSpecialTick;
    state.cheated = true;
    expect(campaignResultText(state, progress)).toMatchObject({ stars: 0, feat: missed, hint: CAMPAIGN_END.cheated, nextId: 12 });
    state.phase = 'lost';
    expect(campaignResultText(state, progress)).toMatchObject({ slots: '0 of 3 stars', feat: missed, story: STORY_TEXT.loss, nextId: null });
  });

  it('offers Next after a cheated win and tells the truth on the last level', () => {
    const state = createGame({ level: LEVELS[0] });
    state.phase = 'won';
    state.cheated = true;
    expect(campaignResultText(state, { 1: 0 })).toMatchObject({
      stars: 0, slots: '0 of 3 stars', hint: CAMPAIGN_END.cheated, nextId: 2, buttons: ['Next level', 'Play again', 'Level map'],
    });
    const last = { ...state, level: LEVELS.at(-1)! };
    expect(campaignResultText(last, {})).toMatchObject({ hint: CAMPAIGN_END.cheatedLast, nextId: null, complete: CAMPAIGN_END.complete });
  });

  it('can retry a loss and cannot advance through a locked card', () => {
    const state = createGame({ level: LEVELS[0] });
    state.phase = 'lost';
    expect(campaignResultText(state, { 1: 3 })).toMatchObject({
      kind: 'lost', slots: '', hint: '', nextId: null, buttons: ['Try again', 'Level map'],
    });
    state.phase = 'won';
    expect(campaignResultText(state, {})).toMatchObject({ complete: '', nextId: null });
  });
});
