// Words on the win and lose screens. No Phaser, so it is unit tested.

import { LEVELS, TWO_STAR_LIVES, THREE_STAR_LIVES, lastWave, levelStars, unlockedLevel, type CampaignProgress, type GameState } from '../../sim';
import { CAMPAIGN_END, END_TEXT, heldBoonsText, livesLeftText, reachedWaveText, starGoalText, starSlots } from '../names';

export type EndKind = 'won' | 'lost';

/** The end screen for this phase, or null while the game is still going. */
export function endKind(state: GameState): EndKind | null {
  return state.phase === 'won' || state.phase === 'lost' ? state.phase : null;
}

export function endScreenText(kind: EndKind, state: GameState): { title: string; lines: string[]; boons: string } {
  const boons = heldBoonsText(state.boons);
  if (kind === 'won') {
    return { title: END_TEXT.wonTitle, lines: [`${END_TEXT.wonLives} ${state.lives}`, `${END_TEXT.wonGold} ${state.gold}`], boons };
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
  const next = LEVELS.find(level => level.id === levelId + 1);
  const nextId = won && next && unlockedLevel(progress, next.id) ? next.id : null;
  const cheatHint = nextId ? CAMPAIGN_END.cheated : CAMPAIGN_END.cheatedLast;
  const hint = won && state.cheated ? cheatHint : stars === 1 ? starGoalText(TWO_STAR_LIVES, 2) : stars === 2 ? starGoalText(THREE_STAR_LIVES, 3) : '';
  const slots = won ? starSlots(stars) : '';
  const complete = won && !next ? CAMPAIGN_END.complete : '';
  return {
    kind, levelId, stars, lives, nextId, slots, hint, complete,
    title: won ? END_TEXT.wonTitle : END_TEXT.lostTitle,
    details: won ? [livesLeftText(lives), hint, complete].filter(Boolean)
      : [reachedWaveText(state.wave, false, lastWave(state))],
    buttons: [...(nextId ? [CAMPAIGN_END.next] : []), won ? END_TEXT.playAgain : CAMPAIGN_END.retry, CAMPAIGN_END.map],
  };
}

export type CampaignResult = NonNullable<ReturnType<typeof campaignResultText>>;
