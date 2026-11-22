// Display names (milestone 22, DECISIONS.md "display names"): every name the
// player reads, keyed by the internal id. Internal ids never change; a rename
// is an edit here (plus regenerated screenshot baselines). Tests that check a
// display string build it from these tables, so a rename changes no test.

import type { Difficulty, EnemyType, MapId, SpecialType, TargetingMode, TowerType } from '../sim';

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

/** Map names (milestone 27): the title menu's thumbnails and the best-score line. */
export const MAP_NAMES: Readonly<Record<MapId, string>> = {
  meadow: 'Meadow',
  switchback: 'Switchback',
  riverbend: 'Riverbend',
};

/** The title menu's words (TitleScene.ts, milestone 25). */
export const TITLE_TEXT = {
  title: 'Tarpit',
  subtitle: 'a tower defense game',
  difficulty: 'Difficulty',
  /** The map row's caption (milestone 27). */
  map: 'Map',
  play: 'Play',
  prompt: 'Pick a difficulty and a map, then press Play',
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
  /** The win screen's primary button (milestone 26): play on into endless waves. */
  keepGoing: 'Keep going',
} as const;

/** The HUD's wave counter: "Wave 3/10", or "Wave 11" in an endless game (milestone 26). */
export function waveCounterText(wave: number, endless: boolean, lastWave: number): string {
  return endless ? `Wave ${wave}` : `Wave ${wave}/${lastWave}`;
}

/** The lose screen's line: "Reached wave 7 of 10", or "Reached wave 14" in an endless game (milestone 26). */
export function reachedWaveText(wave: number, endless: boolean, lastWave: number): string {
  return endless ? `${END_TEXT.lostWave} ${wave}` : `${END_TEXT.lostWave} ${wave} of ${lastWave}`;
}

/**
 * The title menu's high-score line (milestone 26; milestone 27 names the
 * map too): "Best on Riverbend, Normal: 12 waves".
 */
export function bestScoreText(map: MapId, difficulty: Difficulty, waves: number): string {
  return `Best on ${MAP_NAMES[map]}, ${DIFFICULTY_LABELS[difficulty]}: ${waves} ${waves === 1 ? 'wave' : 'waves'}`;
}

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

/** The Start Wave button's label (milestone 25c moved it here from hud.ts). */
export const START_WAVE_TEXT = 'Start Wave';

/**
 * Milestone 25c: the Start Wave button's words while the next wave can be
 * called early ("Call next  +14"), and the tower panel's kill count line
 * ("Kills 43").
 */
export const CALL_EARLY_TEXT = 'Call next';
export const KILLS_TEXT = 'Kills';

/** The Start Wave button's label while a call is possible: "Call next  +14". */
export function callEarlyLabel(bonus: number): string {
  return `${CALL_EARLY_TEXT}  +${bonus}`;
}

/** The tower panel's kill count line: "Kills 43". */
export function killsLabel(kills: number): string {
  return `${KILLS_TEXT} ${kills}`;
}

/** Special attack names (milestone 25b): the HUD popup's buttons. */
export const SPECIAL_NAMES: Readonly<Record<SpecialType, string>> = {
  keg: 'Powder Keg',
  tarBarrel: 'Tar Barrel',
  fireArrows: 'Fire Arrows',
};

/** The HUD's special button label (milestone 25b). */
export const SPECIAL_BUTTON_TEXT = 'Special';
