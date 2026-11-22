// Display names (milestone 22, DECISIONS.md "display names"): every name the
// player reads, keyed by the internal id. Internal ids never change; a rename
// is an edit here (plus regenerated screenshot baselines). Tests that check a
// display string build it from these tables, so a rename changes no test.

import type { Difficulty, EnemyType, SpecialType, TargetingMode, TowerType } from '../sim';

/** The wave 10 boss (docs/SCOPE-v4.md, milestone 23): the HUD boss bar and the wave 10 preview. */
export const BOSS_NAME = 'Grumblefoot';

/** Enemy names, as in the HUD's next-wave preview ("Next: 8 Goblin"). */
export const ENEMY_NAMES: Readonly<Record<EnemyType, string>> = {
  goblin: 'Goblin',
  wolf: 'Wolf',
  troll: 'Troll',
  harpy: 'Harpy',
  shieldbearer: 'Shieldbearer',
  boss: BOSS_NAME,
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

/** Targeting mode names, as on the tower panel's cycle button ("Target: First"). */
export const TARGETING_LABELS: Readonly<Record<TargetingMode, string>> = {
  first: 'First',
  last: 'Last',
  strongest: 'Strongest',
};

/** The tower panel's targeting button text for `mode` ("Target: First"). */
export function targetingButtonText(mode: TargetingMode): string {
  return `Target: ${TARGETING_LABELS[mode]}`;
}

/** Difficulty level names (milestone 25): the title menu's buttons and the HUD tag. */
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** The title menu's words (TitleScene.ts, milestone 25). */
export const TITLE_TEXT = {
  title: 'Tarpit',
  subtitle: 'a tower defense game',
  difficulty: 'Difficulty',
  play: 'Play',
  prompt: 'Pick a difficulty, then press Play',
} as const;

/** The end screens' words (endText.ts and the end screen's buttons). */
export const END_TEXT = {
  playAgain: 'Play again',
  menu: 'Menu',
  wonTitle: 'Victory!',
  wonLives: 'The village stands. Lives left:',
  wonGold: 'Gold left:',
  lostTitle: 'The village fell',
  lostWave: 'Reached wave',
} as const;

/**
 * The tower panel's button words (milestone 25a moved them here). In setup an
 * unlocked tower's Sell reads `remove` (full refund) and an upgrade bought
 * this setup phase turns the Upgrade slot into `undoUpgrade`.
 */
export const PANEL_TEXT = {
  upgrade: 'Upgrade',
  upgraded: 'Upgraded',
  undoUpgrade: 'Undo upgrade',
  sell: 'Sell',
  remove: 'Remove',
} as const;

/** Special attack names (milestone 25b): the HUD popup's buttons. */
export const SPECIAL_NAMES: Readonly<Record<SpecialType, string>> = {
  keg: 'Powder Keg',
  tarBarrel: 'Tar Barrel',
  fireArrows: 'Fire Arrows',
};

/** The HUD's special button label (milestone 25b). */
export const SPECIAL_BUTTON_TEXT = 'Special';
