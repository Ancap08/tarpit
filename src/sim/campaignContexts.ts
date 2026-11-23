// Acceptance metadata in play order. An enemy introduction can remove the
// player's counter in the control run while keeping the encounter itself intact.
import type { LevelContext } from './checkLevel';
import { canTarget } from './combat';
import { SPECIAL_DEFS, type SpecialType } from './specials';
import { TOWER_DEFS } from './towers';
import type { TowerType } from './types';

export const CAMPAIGN_CONTEXTS: readonly LevelContext[] = [
  { band: 'intro', introduces: null },
  { band: 'intro', introduces: { towers: ['cannon'] } },
  { band: 'intro', introduces: { towers: ['tarpit'] } },
  { band: 'middle', introduces: { towers: ['firepot'] } },
  { band: 'middle', introduces: { enemy: 'harpy', mustLose: true, control: {
    towers: (Object.keys(TOWER_DEFS) as TowerType[]).filter(type => canTarget(type, { type: 'harpy' })),
  } } },
  { band: 'transition', introduces: { towers: ['mortar'] } },
  { band: 'late', introduces: { specials: ['barricade'] } },
  { band: 'late', introduces: { specials: ['guards', 'fireArrows'] } },
  { band: 'late', introduces: { maxTowerLevel: 2 } },
  { band: 'finale', introduces: { enemy: 'grumblemaw', control: { specials: Object.keys(SPECIAL_DEFS) as SpecialType[] } } },
];
