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

/** The verb in the aim banner per special (milestone 30). */
const SPECIAL_VERBS: Readonly<Record<SpecialType, string>> = { keg: 'throw', tarBarrel: 'drop', fireArrows: 'shoot' };

/**
 * The aim banner over the map while a special is aimed (milestone 30):
 * the main line ("Tap the trail to drop the Tar Barrel"), then a smaller
 * hint saying how to cancel (and, on touch, how to hold and aim).
 */
export function aimBannerText(type: SpecialType, touch: boolean): { main: string; hint: string } {
  return {
    main: `${touch ? 'Tap' : 'Click'} the trail to ${SPECIAL_VERBS[type]} the ${SPECIAL_NAMES[type]}`,
    hint: touch ? 'Or hold to aim and lift to let go. Special again cancels.' : 'Esc or Special again cancels.',
  };
}

/** The label at a special's spot for about 1.5 s after it lands (milestone 30): "3 hit" or "Missed". */
export function specialResultText(hits: number): string {
  return hits > 0 ? `${hits} hit` : 'Missed';
}

/** The Special button's label while it recharges (milestone 30): whole seconds left, rounded up ("Wait 12s"). */
export function rechargeText(ticksLeft: number, ticksPerSecond: number): string {
  return `Wait ${Math.ceil(ticksLeft / ticksPerSecond)}s`;
}

/** The speed button's label while it is held for 3x (milestone 30); 1x and 2x read "1x" and "2x". */
export function speedLabel(speed: 1 | 2 | 3): string {
  return `${speed}x`;
}

/** The small mark under the Gold readout once the gold cheat was used (milestone 30). */
export const CHEAT_MARK = 'cheat used';
