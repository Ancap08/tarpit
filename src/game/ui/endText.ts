// Words on the win and lose screens. No Phaser, so it is unit tested.

import { WAVES, type GameState } from '../../sim';

export type EndKind = 'won' | 'lost';

/** The end screen for this phase, or null while the game is still going. */
export function endKind(state: GameState): EndKind | null {
  return state.phase === 'won' || state.phase === 'lost' ? state.phase : null;
}

export function endScreenText(kind: EndKind, state: GameState): { title: string; lines: string[] } {
  if (kind === 'won') {
    return { title: 'Victory!', lines: [`The village stands. Lives left: ${state.lives}`, `Gold left: ${state.gold}`] };
  }
  return { title: 'The village fell', lines: [`Reached wave ${state.wave} of ${WAVES.length}`] };
}
