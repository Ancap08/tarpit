// Acceptance metadata in play order. An enemy introduction can remove the
// player's counter in the control run while keeping the encounter itself intact.
import type { LevelContext } from './checkLevel';
import { canTarget } from './combat';
import { SPECIAL_DEFS, type SpecialType } from './specials';
import { TOWER_DEFS } from './towers';
import type { TowerType } from './types';

export const CAMPAIGN_CONTEXTS: readonly LevelContext[] = [
  { band: 'intro', introduces: null, alsoIntroduces: ['musketeer', 'longbow', 'keg', 1, 2, 'goblin'] },
  { band: 'intro', introduces: { towers: ['cannon'] } },
  { band: 'intro', introduces: { towers: ['tarpit'] }, alsoIntroduces: ['wolf'] },
  { band: 'middle', introduces: { towers: ['firepot'] }, alsoIntroduces: ['shieldbearer'] },
  { band: 'middle', introduces: { enemy: 'harpy', mustLose: true, control: {
    towers: (Object.keys(TOWER_DEFS) as TowerType[]).filter(type => canTarget(type, { type: 'harpy' })),
  } }, alsoIntroduces: ['tarBarrel'] },
  { band: 'transition', introduces: { towers: ['mortar'] }, alsoIntroduces: ['troll'] },
  { band: 'late', introduces: { specials: ['barricade'] } },
  { band: 'late', introduces: { specials: ['guards', 'fireArrows'] } },
  { band: 'late', introduces: { maxTowerLevel: 2 }, alsoIntroduces: ['boss'] },
  { band: 'finale', introduces: { enemy: 'grumblemaw', control: { specials: Object.keys(SPECIAL_DEFS) as SpecialType[] } } },
  { band: 'late', introduces: null, introducesTax: 'windowTax' },
  { band: 'late', introduces: null, introducesTax: 'forcedMarch' },
  { band: 'late', introduces: null, introducesTax: 'noLoitering' },
  { band: 'late', introduces: null, introducesTax: 'curfew' },
  { band: 'late', introduces: null, introducesTax: 'frozenPurse' },
  { band: 'late', introduces: null, introducesTax: 'rationing' },
  { band: 'late', introduces: null },
  { band: 'late', introduces: null },
  { band: 'late', introduces: null },
  { band: 'finale', introduces: null },
];
