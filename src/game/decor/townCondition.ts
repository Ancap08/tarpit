import { CAMPAIGN_START_LIVES, DIFFICULTY_DEFS, THREE_STAR_LIVES, TWO_STAR_LIVES, type GameState } from '../../sim';

export const TOWN_CONDITIONS = ['untouched', 'scuffed', 'battered', 'taken'] as const;
export type TownCondition = typeof TOWN_CONDITIONS[number];

export function townCondition(state: Pick<GameState, 'difficulty' | 'level' | 'lives'>): TownCondition {
  const start = state.level ? CAMPAIGN_START_LIVES : DIFFICULTY_DEFS[state.difficulty].startLives;
  const lives = state.lives * CAMPAIGN_START_LIVES;
  if (lives >= THREE_STAR_LIVES * start) return 'untouched';
  if (lives >= TWO_STAR_LIVES * start) return 'scuffed';
  return lives > 0 ? 'battered' : 'taken';
}
