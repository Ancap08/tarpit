// Display names (milestone 22, DECISIONS.md "display names"): every name the
// player reads, keyed by the internal id. Internal ids never change; a rename
// is an edit here (plus regenerated screenshot baselines). Tests that check a
// display string build it from these tables, so a rename changes no test.

import type { EnemyType, TowerType } from '../sim';

/** Enemy names, as in the HUD's next-wave preview ("Next: 8 Goblin"). */
export const ENEMY_NAMES: Readonly<Record<EnemyType, string>> = {
  goblin: 'Goblin',
  wolf: 'Wolf',
  troll: 'Troll',
  harpy: 'Harpy',
  shieldbearer: 'Shieldbearer',
};

/** Tower names, as on the build bar ("Musketeer  50"). */
export const TOWER_NAMES: Readonly<Record<TowerType, string>> = {
  musketeer: 'Musketeer',
  cannon: 'Cannon',
  tarpit: 'Tar Pit',
  longbow: 'Longbow',
  mortar: 'Mortar',
  firepot: 'Fire Pot',
};

/** Short tower names for the labels under towers on the map ("Musket", "Tar+"). */
export const TOWER_SHORT_LABELS: Readonly<Record<TowerType, string>> = {
  musketeer: 'Musket',
  cannon: 'Cannon',
  tarpit: 'Tar',
  longbow: 'Longbow',
  mortar: 'Mortar',
  firepot: 'Fire',
};

/** The wave 10 boss (docs/SCOPE-v4.md, milestone 23). Placeholder until then. */
export const BOSS_NAME = 'Grumblefoot';

/** The end screens' words (endText.ts). */
export const END_TEXT = {
  wonTitle: 'Victory!',
  wonLives: 'The village stands. Lives left:',
  wonGold: 'Gold left:',
  lostTitle: 'The village fell',
  lostWave: 'Reached wave',
} as const;
