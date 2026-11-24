import { towerBuildCost, atTowerCap, allowedTowers, type GameState, type TowerType } from '../../sim';

// All six towers (milestone 11): the three v1 towers, then the v2 three.
export const BAR_TYPES: readonly TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];

export function canPick(state: GameState, type: TowerType): boolean {
  return allowedTowers(state).includes(type) && !state.pendingBoon
    && state.phase !== 'won' && state.phase !== 'lost' && !atTowerCap(state) && state.gold >= towerBuildCost(state, type);
}
