// Words on the win and lose screens. No Phaser, so it is unit tested.

import { WAVES, type GameState } from '../../sim';
import { END_TEXT } from '../names';

export type EndKind = 'won' | 'lost';

/** The end screen for this phase, or null while the game is still going. */
export function endKind(state: GameState): EndKind | null {
  return state.phase === 'won' || state.phase === 'lost' ? state.phase : null;
}

export function endScreenText(kind: EndKind, state: GameState): { title: string; lines: string[] } {
  if (kind === 'won') {
    return { title: END_TEXT.wonTitle, lines: [`${END_TEXT.wonLives} ${state.lives}`, `${END_TEXT.wonGold} ${state.gold}`] };
  }
  return { title: END_TEXT.lostTitle, lines: [`${END_TEXT.lostWave} ${state.wave} of ${WAVES.length}`] };
}
