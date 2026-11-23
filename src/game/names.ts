// Display names (milestone 22, DECISIONS.md "display names"): every name the
// player reads, keyed by the internal id. Internal ids never change; a rename
// is an edit here (plus regenerated screenshot baselines). Tests that check a
// display string build it from these tables, so a rename changes no test.

import { BOONS, type BoonId, type Difficulty, type EnemyType, type MapId, type SpecialType, type TargetingMode, type TowerLevel, type TowerType, type UpgradePath } from '../sim';

/** The wave 10 boss (docs/SCOPE-v4.md, milestone 23): the HUD boss bar and the wave 10 preview. */
export const BOSS_NAME = 'Grumblefoot';
export const GRUMBLEMAW_NAME = 'Grumblemaw';

/** Enemy names, as in the HUD's next-wave preview ("Next: 8 Goblin"). */
export const ENEMY_NAMES: Readonly<Record<EnemyType, string>> = {
  goblin: 'Goblin',
  wolf: 'Wolf',
  troll: 'Troll',
  harpy: 'Harpy',
  shieldbearer: 'Shieldbearer',
  boss: BOSS_NAME,
  grumblemaw: GRUMBLEMAW_NAME,
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
  look: 'Look',
  classic: 'Classic',
  painted: 'Painted',
  play: 'Play',
  prompt: 'Pick a difficulty and a map, then press Play',
} as const;

export function paintedLoadingText(progress: number): string {
  return `Loading painted art ${Math.floor(progress * 100)}%`;
}

export const PAINTED_FALLBACK = 'Painted art could not load. Playing Classic.';

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

/** The HUD's wave counter: "Wave 3/20", or "Wave 21" in an endless game (milestone 26). */
export function waveCounterText(wave: number, endless: boolean, lastWave: number): string {
  return endless ? `Wave ${wave}` : `Wave ${wave}/${lastWave}`;
}

/** The lose screen's line: "Reached wave 7 of 20", or "Reached wave 24" in an endless game (milestone 26). */
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
  undoUpgrade: 'Undo upgrade',
  sell: 'Sell',
  remove: 'Remove',
  notEnoughGold: 'Not enough gold',
} as const;

export const PATH_NAMES: Readonly<Record<TowerType, Record<UpgradePath, string>>> = {
  musketeer: { A: 'Sharpshooter', B: 'Volley' },
  cannon: { A: 'Heavy Shot', B: 'Quick Loader' },
  tarpit: { A: 'Deep Tar', B: 'Wide Tar' },
  longbow: { A: 'War Bow', B: 'Quick Draw' },
  mortar: { A: 'Siege Shell', B: 'Wide Burst' },
  firepot: { A: 'Inferno', B: 'Lasting Flames' },
};

export function towerPanelTitle(type: TowerType, level: TowerLevel, path?: UpgradePath): string {
  return `${path ? PATH_NAMES[type][path] : TOWER_NAMES[type]} · Level ${level}`;
}

const PATH_DESCRIPTIONS: Readonly<Record<TowerType, Record<UpgradePath, string>>> = {
  musketeer: { A: 'Farther, harder shots', B: 'Fires much faster' },
  cannon: { A: 'A much bigger blast', B: 'Fires twice as fast' },
  tarpit: { A: 'Slows enemies to a crawl', B: 'Slows from farther away' },
  longbow: { A: 'Hits almost twice as hard', B: 'Fires almost twice as fast' },
  mortar: { A: 'Hits much harder', B: 'Blast reaches twice as far' },
  firepot: { A: 'Hotter, shorter burns', B: 'Burns twice as long' },
};

/** The upgrade's change from level two. Rewards are applied separately by the sim. */
export function pathDescription(type: TowerType, path: UpgradePath): string {
  return PATH_DESCRIPTIONS[type][path];
}

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
export function killsLabel(kills: number, atCampaignCap = false): string {
  return `${KILLS_TEXT} ${kills}${atCampaignCap ? ' · Max for this level' : ''}`;
}

/** Special attack names (milestone 25b): the HUD popup's buttons. */
export const SPECIAL_NAMES: Readonly<Record<SpecialType, string>> = {
  keg: 'Powder Keg',
  tarBarrel: 'Tar Barrel',
  fireArrows: 'Fire Arrows',
  barricade: 'Barricade',
  guards: 'Guards',
};

/** The HUD's special button label (milestone 25b). */
export const SPECIAL_BUTTON_TEXT = 'Special';

/** The verb in the aim banner per special (milestone 30). */
const SPECIAL_VERBS: Readonly<Record<SpecialType, string>> = { keg: 'throw', tarBarrel: 'drop', fireArrows: 'shoot', barricade: 'place', guards: 'send' };

export const BARRICADE_UNLOCKED = 'Barricade unlocked';
export function heldCountText(count: number): string {
  return `x${count}`;
}
export const GUARDS_UNLOCKED = 'Guards unlocked';
export const GUARDS_UNLOCK_HINT = 'Use Special to send four guards.';
export const BARRICADE_UNLOCK_HINT = 'Use Special to block the trail.';
export const BARRICADE_AIM_REASONS = {
  'off-trail': 'Aim closer to the trail.',
  'out-of-bounds': 'Aim inside the map.',
  'near-spawn': 'Too close to the cave.',
  'near-exit': 'Too close to the exit.',
} as const;

/**
 * The aim banner over the map while a special is aimed (milestone 30):
 * the main line ("Tap the trail to drop the Tar Barrel"), then a smaller
 * hint saying how to cancel (and, on touch, how to hold and aim).
 */
export function aimBannerText(type: SpecialType, touch: boolean): { main: string; hint: string } {
  return {
    main: `${touch ? 'Tap' : 'Click'} the trail to ${SPECIAL_VERBS[type]} ${type === 'guards' ? 'guards' : `the ${SPECIAL_NAMES[type]}`}`,
    hint: touch ? 'Or hold to aim and lift to let go. Special again cancels.' : 'Esc or Special again cancels.',
  };
}

/**
 * The aim banner's geometry (milestone 30, shared from milestone 34 so the
 * map decoration keeps clear of it): its top (px below the map's top
 * edge), height, the two lines' font sizes and the side padding added to
 * the wider line.
 */
export const AIM_BANNER = { top: 8, height: 46, mainPx: 18, hintPx: 13, padX: 32 } as const;

/** Courier New (FONT, monospace) advances 0.6 of the font size per character. */
export const MONO_ADVANCE = 0.6;

/** The aim banner's widest possible width in px: its longest main or hint line over every special, click and touch. */
export function aimBannerMaxWidth(): number {
  let widest = 0;
  for (const type of Object.keys(SPECIAL_NAMES) as SpecialType[]) {
    for (const touch of [false, true]) {
      const t = aimBannerText(type, touch);
      widest = Math.max(widest, t.main.length * AIM_BANNER.mainPx * MONO_ADVANCE, t.hint.length * AIM_BANNER.hintPx * MONO_ADVANCE);
    }
  }
  return Math.ceil(widest + AIM_BANNER.padX);
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

/**
 * Milestone 31 (effects): the wave banners ("Wave 3", "Wave 3 cleared" with
 * "+20 gold" under it), the boss banner's second line, and the gold that
 * floats up from a kill ("+2").
 */
export function waveStartBanner(wave: number): string {
  return `Wave ${wave}`;
}
export function waveClearBanner(wave: number): string {
  return `Wave ${wave} cleared`;
}
export function bonusGoldText(bonus: number): string {
  return `+${bonus} gold`;
}
export const BOSS_BANNER_SUB = 'is coming';
export function goldGainText(amount: number): string {
  return `+${amount}`;
}

/** Milestone 33: the mute button's state words and the key hint (window.__tarpit.audio() label and hint; README). */
export const MUTE_TEXT = {
  on: 'Sound on',
  off: 'Sound off',
  hint: 'M turns the sound on or off',
} as const;

/** The intermission reward, its held icons and the campaign's new moments. */
export const BOON_NAMES: Readonly<Record<BoonId, string>> = {
  longBarrels: 'Long Barrels',
  keenArrows: 'Keen Arrows',
  warChest: 'War Chest',
  stickyTar: 'Sticky Tar',
  hotCoals: 'Hot Coals',
  quickHands: 'Quick Hands',
  stoneWalls: 'Stone Walls',
  veteranCrews: 'Veteran Crews',
  biggerBlasts: 'Bigger Blasts',
};

export const REWARD_KEYS: readonly string[] = ['1', '2', '3'];
export const BOON_PENDING_TEXT = 'Pick a reward';
export const BOON_WAVE_TEXT = 'Reward wave';
export const REWARD_PICKED_TEXT = 'Reward picked';
export const LAST_WAVE_TEXT = 'Last wave';
export const BOSS_WAVE_NEXT_TEXT = 'Boss wave next';
export const ACT_TWO_TEXT = 'Act II';
export const PACK_CALL_TEXT = 'Wolves at the cave!';
export const GRUMBLEMAW_SUB = 'is here';

export function rewardTitle(wave: number): string {
  return `Wave ${wave} reward`;
}

export function heldBoonsText(boons: readonly BoonId[]): string {
  return boons.length === 0 ? '' : `Rewards: ${boons.map((id) => BOON_NAMES[id]).join(' · ')}`;
}

export function boonDescription(id: BoonId): string {
  const value = BOONS[id].value;
  const gain = Math.round((value - 1) * 100);
  switch (id) {
    case 'longBarrels': return `Cannons and Mortars reach ${gain}% farther`;
    case 'keenArrows': return `Longbows hit ${gain}% harder`;
    case 'warChest': return `${value} gold right now`;
    case 'stickyTar': return `Tar slows enemies ${value === 2 ? 'twice as long' : `${gain}% longer`}`;
    case 'hotCoals': return `Fire burns ${gain}% hotter`;
    case 'quickHands': return `Specials come back ${-gain}% sooner`;
    case 'stoneWalls': return `${value} more lives`;
    case 'veteranCrews': return `Every tower fires ${gain}% faster`;
    case 'biggerBlasts': return `Explosions are ${gain}% bigger`;
  }
}

export function blockedWaveLabel(pending: boolean, reason: string): string {
  return pending ? `${START_WAVE_TEXT}\n${BOON_PENDING_TEXT}` : `${CALL_EARLY_TEXT}\n${reason}`;
}

export const CAMPAIGN_END = {
  cheated: 'Gold cheat used: stars not saved',
  next: 'Next level',
  map: 'Level map',
  retry: 'Try again',
  complete: 'Campaign complete!',
} as const;

export function livesLeftText(lives: number): string {
  return `Lives left: ${lives}`;
}

export function starGoalText(lives: number, stars: 2 | 3): string {
  return `Finish with ${lives} lives for ${stars === 2 ? 'two' : 'three'} stars`;
}

/** Campaign cards and twist lines, keyed by the saved level id. */
export const LEVEL_NAMES: Readonly<Record<number, { name: string; twist: string }>> = {
  1: { name: 'First Watch', twist: 'Cover the trail with Musketeers and Longbows.' },
  2: { name: 'Pack Trail', twist: 'Use Cannon fire to thin the crowds.' },
  3: { name: 'The Switchback', twist: 'Slow the Wolves at the bends.' },
  4: { name: 'Burn Line', twist: 'Set the tar alight as Shieldbearers march through.' },
  5: { name: 'Wings Over the River', twist: 'Keep the sky covered as Harpies cross the river.' },
  6: { name: 'Heavy Feet', twist: 'Give the Mortar a clear shot at the Trolls.' },
  7: { name: 'Hold the Bend', twist: 'Raise a Barricade within reach of your towers.' },
  8: { name: 'Stand Fast', twist: 'Meet the crowds with Guards and Fire Arrows.' },
  9: { name: 'The Troll King', twist: 'Choose a second upgrade before Grumblefoot arrives.' },
  10: { name: 'Last Light', twist: 'Bring every special to the fight with Grumblemaw.' },
};

export const CAMPAIGN_TEXT = {
  campaign: 'Campaign',
  freePlay: 'Free play',
  levelMap: 'Level map',
  back: 'Back',
  bestStars: 'Best stars',
  newThisLevel: 'New this level',
} as const;

export const LEVEL_NEW: Readonly<Record<number, string>> = {
  1: 'Musketeer, Longbow and Powder Keg',
  2: 'Cannon',
  3: 'Tar Pit',
  4: 'Fire Pot and Shieldbearers',
  5: 'Harpies and Tar Barrel',
  6: 'Mortar and Trolls',
  7: 'Barricade',
  8: 'Guards and Fire Arrows',
  9: 'Second upgrades and Grumblefoot',
  10: 'The full arsenal and Grumblemaw',
};

export const levelNumberText = (id: number): string => `Level ${id}`;
export const lockedLevelText = (id: number): string => `Win level ${id} first`;
export const starSlots = (stars: number): string => '★'.repeat(stars) + '☆'.repeat(3 - stars);
