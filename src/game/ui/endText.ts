// Words on the win and lose screens. No Phaser, so it is unit tested.

import { ACT_ONE_LAST_LEVEL } from './campaignMap';
import { LEVELS, TWO_STAR_LIVES, THREE_STAR_LIVES, earnedFeat, lastWave, levelStars, unlockedLevel, type CampaignProgress, type GameState } from '../../sim';
import { CAMPAIGN_END, END_TEXT, LEVEL_STORY, STORY_TEXT, featResultText, heldBoonsText, livesLeftText, reachedWaveText, starGoalText, starSlots } from '../names';

export type EndKind = 'won' | 'lost';

/** The end screen for this phase, or null while the game is still going. */
export function endKind(state: GameState): EndKind | null {
  return state.phase === 'won' || state.phase === 'lost' ? state.phase : null;
}

export function endScreenText(kind: EndKind, state: GameState): { title: string; lines: string[]; boons: string } {
  const boons = heldBoonsText(state.boons);
  if (kind === 'won') {
    const lines = [`${END_TEXT.wonLives} ${state.lives}`, `${END_TEXT.wonGold} ${state.gold}`];
    const feat = state.fixedFeat;
    if (feat) lines.push(featResultText(feat, !state.cheated && state.lives >= TWO_STAR_LIVES && earnedFeat(state, feat)));
    return { title: END_TEXT.wonTitle, lines, boons };
  }
  return { title: END_TEXT.lostTitle, lines: [reachedWaveText(state.wave, state.endless, lastWave(state))], boons };
}

export function campaignResultText(state: GameState, progress: CampaignProgress) {
  const kind = endKind(state);
  if (!kind || !state.level) return null;
  const won = kind === 'won';
  const stars = levelStars(state);
  const lives = Math.max(0, state.lives);
  const levelId = state.level.id;
  const nextId = won && unlockedLevel(progress, levelId + 1) ? levelId + 1 : null;
  const cheatHint = nextId ? CAMPAIGN_END.cheated : CAMPAIGN_END.cheatedLast;
  const hint = won && state.cheated ? cheatHint : stars === 1 ? starGoalText(TWO_STAR_LIVES, 2) : stars === 2 && !state.level.feat ? starGoalText(THREE_STAR_LIVES, 3) : '';
  const feat = won && state.level.feat ? featResultText(state.level.feat, stars === 3) : '';
  const slots = won ? starSlots(stars) : '';
  const actClose = won && levelId === ACT_ONE_LAST_LEVEL ? STORY_TEXT.firstActClose : '';
  const complete = won && levelId === LEVELS.at(-1)?.id ? CAMPAIGN_END.complete : '';
  return {
    kind, levelId, stars, lives, nextId, slots, hint, feat, actClose, complete,
    story: won ? LEVEL_STORY[levelId].reply : STORY_TEXT.loss,
    title: won ? END_TEXT.wonTitle : END_TEXT.lostTitle,
    details: [won ? livesLeftText(lives) : reachedWaveText(state.wave, false, lastWave(state)), hint, feat, complete].filter(Boolean),
    buttons: [...(nextId ? [CAMPAIGN_END.next] : []), won ? END_TEXT.playAgain : CAMPAIGN_END.retry, CAMPAIGN_END.map],
  };
}

export type CampaignResult = NonNullable<ReturnType<typeof campaignResultText>>;
