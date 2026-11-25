// Display names (milestone 22, DECISIONS.md "display names"): every name the
// player reads, keyed by the internal id. Internal ids never change; a rename
// is an edit here (plus regenerated screenshot baselines). Tests that check a
// display string build it from these tables, so a rename changes no test.

import { LEVELS } from '../sim/levels.ts';
import { BOONS } from '../sim/boons.ts';
import { BARREL_RECHARGE_TICKS } from '../sim/specials.ts';
import { TICKS_PER_SECOND } from '../sim/time.ts';
import type { BoonId, Difficulty, EnemyType, LevelDef, LevelFeat, LevelTaxes, MapId, SpecialType, TargetingMode, TaxKind, TowerLevel, TowerType, UpgradePath } from '../sim';

/** The wave 10 boss (docs/SCOPE-v4.md, milestone 23): the HUD boss bar and the wave 10 preview. */
export const BOSS_NAME = 'Assessor Grumblefoot';
export const GRUMBLEMAW_NAME = 'King Grumblemaw';

/** Full names for cards, tips and boss introductions. */
export const ENEMY_NAMES: Readonly<Record<EnemyType, string>> = {
  goblin: 'Goblin Collector',
  wolf: 'Revenue Hound',
  troll: 'Toll Troll',
  harpy: 'Royal Harpy',
  shieldbearer: 'Redcoat Shieldbearer',
  boss: BOSS_NAME,
  grumblemaw: GRUMBLEMAW_NAME,
  ram: 'The Final Notice',
};

/** Compact names for the HUD's counted list and its uncounted boss suffix. */
export const ENEMY_SHORT_NAMES: Readonly<Record<EnemyType, string>> = {
  goblin: 'Collector',
  wolf: 'Hound',
  troll: 'Toll Troll',
  harpy: 'Harpy',
  shieldbearer: 'Redcoat',
  boss: 'Grumblefoot',
  grumblemaw: 'Grumblemaw',
  ram: 'Ram',
};

export const GUARD_NAMES = ['Axeman', 'Swordsman', 'Archer', 'Captain'] as const;

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
export const OLD_KEEP_NAME = 'Old Keep';
export const KEEP_TEXT = {
  loading: 'Loading the Old Keep…',
  failed: 'The Old Keep could not load.',
  back: 'Back to title',
} as const;

export const MAP_NAMES: Readonly<Record<MapId | 'keep', string>> = {
  keep: OLD_KEEP_NAME,
  meadow: 'Meadow',
  switchback: 'Switchback',
  riverbend: 'Riverbend',
};

/** The title menu's words (TitleScene.ts, milestone 25). */
export const TITLE_TEXT = {
  title: 'Tarpit',
  loading: 'Loading',
  slogan: 'Taxation is theft',
  story: 'The King wants your gold. Keep it.',
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

export function paintedLoadingText(progress: number, compact = false): string {
  const amount = `${Math.floor(progress * 100)}%`;
  return compact ? `Loading\n${amount}` : `Loading painted art ${amount}`;
}

export const PAINTED_FALLBACK = 'Painted art could not load. Playing Classic.';

export const PAUSE_TEXT = {
  button: 'Pause', title: 'Paused', resume: 'Resume', restart: 'Restart', confirm: 'Confirm restart',
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
  tarpit: { A: 'Deep Tar', B: 'Feathers' },
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
  tarpit: { A: 'Slows enemies to a crawl', B: 'Tarred enemies run back.' },
  longbow: { A: 'Hits almost twice as hard', B: 'Fires almost twice as fast' },
  mortar: { A: 'Hits much harder', B: 'Blast reaches twice as far' },
  firepot: { A: 'Hotter, shorter burns', B: 'Burns twice as long' },
};

/** The upgrade's change from level two. Rewards are applied separately by the sim. */
export function pathDescription(type: TowerType, path: UpgradePath): string {
  return PATH_DESCRIPTIONS[type][path];
}

export const TAX_NAMES: Readonly<Record<TaxKind, string>> = {
  windowTax: 'Window Tax', frozenPurse: 'Frozen Purse', forcedMarch: 'Forced March',
  curfew: 'Curfew', noLoitering: 'No Loitering', rationing: 'Rationing',
};

export function taxStatusText(taxes: LevelTaxes | undefined, standing?: number): string {
  if (!taxes) return '';
  return (Object.keys(TAX_NAMES) as TaxKind[]).filter(key => taxes[key] !== undefined).map(key => {
    return key === 'rationing' && taxes.rationing !== undefined && standing !== undefined && standing >= taxes.rationing
      ? 'Rationing (full)' : TAX_NAMES[key];
  }).join(' · ');
}

export function towerCountText(standing: number, cap: number): string {
  return `${standing}/${cap} towers`;
}

export function autoWaveText(seconds: number): string {
  return `Start in ${seconds}s`;
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
export function callEarlyLabel(bonus: number, stacked = false): string {
  return `${CALL_EARLY_TEXT}${stacked ? '\n' : '  '}+${bonus}`;
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

const featherBarrelWait = rechargeText(BARREL_RECHARGE_TICKS, TICKS_PER_SECOND, true);
export const TAR_BARREL_DESCRIPTION = `Feathers a crowd. Next special in ${featherBarrelWait}.`;

/** The HUD's special button label (milestone 25b). */
export const SPECIAL_BUTTON_TEXT = 'Special';

/** The verb in the aim banner per special (milestone 30). */
const SPECIAL_VERBS: Readonly<Record<SpecialType, string>> = { keg: 'throw', tarBarrel: 'drop', fireArrows: 'shoot', barricade: 'place', guards: 'send' };

export const BARRICADE_UNLOCKED = 'Barricade unlocked';
export function heldCountText(count: number): string {
  return `x${count}`;
}
export const GUARDS_UNLOCKED = 'Guards unlocked';
export const GUARDS_UNLOCK_HINT = `Use ${SPECIAL_BUTTON_TEXT} to send four guards.`;
export const BARRICADE_UNLOCK_HINT = `Use ${SPECIAL_BUTTON_TEXT} to block the trail.`;
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
export function aimBannerText(type: SpecialType, touch: boolean, compact = false): { main: string; hint: string } {
  if (compact) return {
    main: `${touch ? 'Tap' : 'Click'} the trail to ${SPECIAL_VERBS[type]} ${SPECIAL_NAMES[type]}`,
    hint: touch ? `Hold, aim, lift. ${SPECIAL_BUTTON_TEXT} cancels.` : `Esc or ${SPECIAL_BUTTON_TEXT} again cancels.`,
  };
  return {
    main: `${touch ? 'Tap' : 'Click'} the trail to ${SPECIAL_VERBS[type]} ${type === 'guards' ? 'guards' : `the ${SPECIAL_NAMES[type]}`}`,
    hint: touch ? `Or hold to aim and lift to let go. ${SPECIAL_BUTTON_TEXT} again cancels.` : `Esc or ${SPECIAL_BUTTON_TEXT} again cancels.`,
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
export function rechargeText(ticksLeft: number, ticksPerSecond: number, compact = false): string {
  return `${compact ? '' : 'Wait '}${Math.ceil(ticksLeft / ticksPerSecond)}s`;
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
export const BOSS_WAVE_NEXT_TEXT = 'Boss next';
export const ACT_TWO_TEXT = 'Act II';
export const PACK_CALL_TEXT = 'Revenue Hounds at the cave!';
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
  cheated: 'Gold cheat: next level open, no stars',
  cheatedLast: 'Gold cheat used: no stars saved',
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

const secondAct = LEVELS.filter(level => level.taxes);
const smallNumbers = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
const numberWord = (n: number) => smallNumbers[n] ?? String(n);
const capitalized = (word: string) => word[0].toUpperCase() + word.slice(1);
const percent = (rate: number) => `${Number((rate * 100).toFixed(8))}%`;
const spokenShare = (rate: number) => rate === 0.2 ? 'one fifth' : rate === 0.1 ? 'a tenth' : percent(rate);

function taxValue(level: LevelDef, key: TaxKind): number {
  const value = level.taxes?.[key];
  if (value === undefined) throw new Error(`Level ${level.id} has no ${key} for its notice`);
  return value;
}

function levelTaxWord(id: number, key: TaxKind): string {
  return numberWord(taxValue(LEVELS.find(level => level.id === id)!, key));
}

/** Commissioned wording with the amounts read from the same record as combat. */
export function secondActNotice(level: LevelDef): string {
  const tax = (key: TaxKind) => taxValue(level, key);
  const kinds = (Object.keys(TAX_NAMES) as TaxKind[]).filter(key => level.taxes?.[key] !== undefined);
  switch (kinds.join('+')) {
    case 'windowTax': return `A tax on windows. Each tower you build adds ${percent(tax('windowTax'))} to the price of the next.`;
    case 'forcedMarch': return `Quick march! My collectors now travel ${spokenShare(tax('forcedMarch'))} faster.`;
    case 'noLoitering': return `No loitering. The next wave comes ${numberWord(tax('noLoitering'))} seconds after the last, ready or not.`;
    case 'curfew': return `By royal measure, every tower now shoots ${percent(tax('curfew'))} less far.`;
    case 'frozenPurse': return `Your purse is frozen. Nothing for a fallen collector; ${tax('frozenPurse')} gold for each wave cleared.`;
    case 'rationing': return `${capitalized(numberWord(tax('rationing')))} tower permits, no more. Take one down to put another up.`;
    case 'curfew+noLoitering': return `Curfew, and no loitering. Towers reach ${spokenShare(tax('curfew'))} less far; waves come ${numberWord(tax('noLoitering'))} seconds apart.`;
    case 'forcedMarch+rationing': return `${capitalized(numberWord(tax('rationing')))} permits, and my collectors march ${percent(tax('forcedMarch'))} faster.`;
    case 'windowTax+curfew': return `Windows again, and a curfew. Each tower adds ${percent(tax('windowTax'))} to the next; all shoot ${spokenShare(tax('curfew'))} less far.`;
    case 'frozenPurse+curfew': return `Purse frozen: ${tax('frozenPurse')} gold a wave, nothing for kills. Towers reach ${spokenShare(tax('curfew'))} less far.${level.endingBoss && ENEMY_NAMES[level.endingBoss] === GRUMBLEMAW_NAME ? ' I am coming myself.' : ''}`;
    // Tax combinations without a commissioned notice use one sentence per rule.
    default: return kinds.map(key => key === 'rationing'
      ? `I issue ${numberWord(tax(key))} tower permits.`
      : `${capitalized(taxRules[key](tax(key)))}.`).join(' ');
  }
}

export { secondActNotice as royalTaxNotice };

const taxRules: Record<TaxKind, (value: number) => string> = {
  windowTax: v => `each tower adds ${percent(v)} to the next`,
  frozenPurse: v => `${v} gold per wave, none for kills`,
  forcedMarch: v => `collectors move ${percent(v)} faster`,
  curfew: v => `towers reach ${percent(v)} less far`,
  noLoitering: v => `${v} seconds between waves`,
  rationing: v => `${v} towers at most`,
};

export function levelTaxLines(taxes: LevelTaxes): string[] {
  return (Object.keys(TAX_NAMES) as TaxKind[]).flatMap(key => {
    const value = taxes[key];
    return value === undefined ? [] : [`${TAX_NAMES[key]}: ${taxRules[key](value)}`];
  });
}

/** Campaign cards and twist lines, keyed by the saved level id. */
export const LEVEL_NAMES: Readonly<Record<number, { name: string; twist: string }>> = {
  1: { name: 'First Watch', twist: 'Cover the trail with Musketeers and Longbows.' },
  2: { name: 'Pack Trail', twist: 'Use Cannon fire to thin the crowds.' },
  3: { name: 'The Switchback', twist: 'Slow the Revenue Hounds at the bends.' },
  4: { name: 'Burn Line', twist: 'Ignite the tar under Redcoat Shieldbearers.' },
  5: { name: 'Wings Over the River', twist: 'Cover the sky as Royal Harpies cross the river.' },
  6: { name: 'Heavy Feet', twist: 'Give the Mortar a clear shot at the Toll Trolls.' },
  7: { name: 'Hold the Bend', twist: 'Raise a Barricade within reach of your towers.' },
  8: { name: 'Stand Fast', twist: 'Meet the crowds with Guards and Fire Arrows.' },
  9: { name: "The King's Assessor", twist: 'Face Assessor Grumblefoot with a second upgrade.' },
  10: { name: 'Last Light', twist: 'Bring every special to face King Grumblemaw.' },
  11: { name: 'Window Money', twist: 'Spend on upgrades as new towers grow dearer.' },
  12: { name: 'The Quickstep', twist: 'Catch the collectors before they round the bend.' },
  13: { name: `${capitalized(levelTaxWord(13, 'noLoitering'))} Bells`, twist: 'Choose your next purchase before the bell.' },
  14: { name: 'Short Measure', twist: 'Cover the bends with overlapping fields of fire.' },
  15: { name: 'Pay Day', twist: 'Make each wave payment last.' },
  16: { name: `${capitalized(levelTaxWord(16, 'rationing'))} Permits`, twist: `Put all ${levelTaxWord(16, 'rationing')} permits to work.` },
  17: { name: 'Closing Time', twist: 'Find nearby targets before the next bell.' },
  18: { name: `${capitalized(levelTaxWord(18, 'rationing'))} at the Gate`, twist: `Give ${levelTaxWord(18, 'rationing')} towers time to stop a faster column.` },
  19: { name: 'The Sash Levy', twist: 'Choose the site before paying for the windows.' },
  20: { name: 'The Last Writ', twist: 'Hold the river until the King arrives.' },
  21: { name: 'Rent Overdue', twist: 'Hold the east road at the gate.' },
  22: { name: 'Feather Beds', twist: 'Shake out pillows over the west road.' },
  23: { name: 'Both Roads', twist: 'Defend both roads from the open wall spots.' },
  24: { name: 'Quartering', twist: 'Decide whether the wall spot is worth the gold.' },
  25: { name: ENEMY_NAMES.ram, twist: 'Send the Ram back before the King arrives.' },
};

const endingLead = 'The King went home with empty pockets.';

export const STORY_TEXT = {
  openingTitle: 'Royal notice',
  endingTitle: 'Word from the town',
  openingNotice: 'Hear ye. By order of King Grumblemaw, all gold in this town now belongs to the Crown. Collectors are on their way.',
  openingReply: "We counted it. It's ours.",
  firstActClose: 'He will be back with new ideas.',
  secondActNotice: 'The King has thought of new taxes.',
  secondActClose: 'He will be back, and he is bringing the army.',
  thirdActNotice: 'No more notices. The King marches on your town with his whole army.',
  thirdActReply: 'We moved to the Old Keep. The tea went in the moat.',
  siegeEnding: 'The King rode home in a tarred and feathered carriage, unpaid. The town kept its gold and opened a market with no stamps. Taxation is theft.',
  secondActReply: 'Fetch the ledger. We have a few deductions.',
  ending: `${endingLead} The gold stayed where it was earned. Taxation is theft.`,
  loss: 'The Crown thanks you for your contribution.',
  continue: 'Continue',
} as const;

const secondActReplies: Readonly<Record<number, string>> = {
  11: 'We put the money into the roof.',
  12: 'Quick trip home, too.',
  13: 'We built a tower before the bell stopped ringing.',
  14: 'Stand a little closer, Your Majesty.',
  15: 'Count it again. We earned every piece.',
  16: 'We added a floor. Same permit.',
  17: 'Our clock runs fine. How is yours?',
  18: `${capitalized(levelTaxWord(18, 'rationing'))} were plenty.`,
  19: 'We saved you a seat by the window.',
  20: 'You had your look. The gold stays here.',
};

export const LEVEL_STORY: Readonly<Record<number, { notice: string; reply: string }>> = {
  1: { notice: 'A tax on doors. Collectors will call at yours.', reply: 'We kept the doors. And the gold.' },
  2: { notice: 'A tax on wheels, carts and anything that rolls.', reply: 'Our cannonballs roll. Collect those.' },
  3: { notice: 'A tax on running. The Hounds will show you how.', reply: 'They ran. Slowly. Sorry about the tar.' },
  4: { notice: 'A tax on firewood, payable to the Redcoats at once.', reply: 'We burned it ourselves, thanks.' },
  5: { notice: 'A tax on the sky. The Royal Harpies own it now.', reply: 'The sky is still free. Mind the feathers.' },
  6: { notice: 'A toll on this road: one Troll per traveller.', reply: 'Toll paid. In mortar shells.' },
  7: { notice: 'A tax on standing still. Move along, all of you.', reply: 'We built a wall. It stood very still.' },
  8: { notice: 'A tax on neighbours helping neighbours.', reply: 'The neighbours say no.' },
  9: { notice: 'The Assessor will now count your gold. Personally.', reply: 'He lost count.' },
  10: { notice: 'Enough. The King is coming for the lot.', reply: endingLead },
  ...Object.fromEntries(secondAct.map(level => [
    level.id, { notice: secondActNotice(level), reply: secondActReplies[level.id] },
  ])),
  21: { notice: "You hide in my grandfather's keep. The rent is overdue. So is the tax on the rent.", reply: 'We never signed the lease.' },
  22: { notice: 'I hear you sleep soundly in there. Sleep is now taxed, by the hour.', reply: 'No vote, no tax. Have some feathers.' },
  23: { notice: 'Who built those roads? I did, with your gold. My surveyor has condemned your wall.', reply: 'We paid for the roads. Walk home on them.' },
  24: { notice: 'A soldier of mine will lodge on your wall. Feed him, and thank me for it.', reply: 'No quarter without consent. He bunks with the Trolls.' },
  25: { notice: 'Final notice. Pay what you owe for the privilege of being ruled.', reply: 'Taxation is theft. Returned to sender.' },
};

export const CAMPAIGN_TEXT = {
  campaign: 'Campaign',
  freePlay: 'Free play',
  levelMap: 'Level map',
  actOne: 'Act One',
  actTwo: 'Act Two',
  actThree: 'Act Three',
  actTabs: ['Act I', 'Act II', 'Act III'],
  gateRule: 'The gate holds walkers. Repair it between waves.',
  featStar: 'Third star: level feat',
  inForce: 'In force',
  townAnswer: "Town's answer: Tar Barrels feather crowds.",
  mapNotes: 'Map notes',
  notice: 'Notice',
  back: 'Back',
  tips: 'Tips',
  gotIt: 'Got it',
  bestStars: 'Best stars',
  newThisLevel: 'New this level',
} as const;

export const LEVEL_NEW: Readonly<Record<number, string>> = {
  1: 'Musketeer, Longbow and Powder Keg',
  2: 'Cannon',
  3: 'Tar Pit',
  4: 'Fire Pot and Redcoat Shieldbearers',
  5: 'Royal Harpies and Tar Barrel',
  6: 'Mortar and Toll Trolls',
  7: 'Barricade',
  8: 'Guards and Fire Arrows',
  9: 'Second upgrades and Assessor Grumblefoot',
  10: 'The full arsenal and King Grumblemaw',
  ...Object.fromEntries(secondAct.map(level => [level.id,
    (Object.keys(TAX_NAMES) as TaxKind[]).filter(key => level.taxes![key] !== undefined).map(key => TAX_NAMES[key]).join(' and '),
  ])),
  21: 'Gate, Repair, Last stand and high ground',
  22: 'Pillow windows',
  23: 'Two roads and Royal Survey',
  24: 'Quartering',
  25: 'The Final Notice',
};

export const GATE_TEXT = {
  label: 'Gate',
  countdown: (seconds: number) => `Last stand! ${seconds}s`,
  health: (hp: number, max: number) => `Gate ${Math.round(hp * 100 / max)}%`,
  repair: (cost?: number) => cost === undefined ? 'Repair' : `Repair ${cost}`,
  repairWarning: (feat: LevelFeat | undefined, boughtRepair: boolean | undefined) =>
    feat?.kind === 'noRepairs' && !boughtRepair ? 'Costs the third star' : '',
  lastStand: 'Last stand!',
  fallen: 'Gate fallen',
};

const featNames: Record<LevelFeat['kind'], string> = {
  noLeaks: 'Not a penny', noSpecials: 'Bare hands', maxTowers: 'Few hands', unbroken: 'Unbroken', noRepairs: 'Not a nail',
};

function featMeaning(feat: LevelFeat): string {
  switch (feat.kind) {
    case 'noLeaks': return 'let no collector through.';
    case 'noSpecials': return 'win without using a special.';
    case 'maxTowers': return `build at most ${feat.limit} towers in all.`;
    case 'noRepairs': return 'win without a repair.';
    case 'unbroken': return 'win with the gate standing.';
  }
}

export function levelFeatText(feat: LevelFeat): string {
  return `${featNames[feat.kind]}: ${featMeaning(feat)}`;
}

export const cardFeatText = (feat: LevelFeat): string => `Third star, ${levelFeatText(feat)}`;
export const featResultText = (feat: LevelFeat, earned: boolean): string =>
  earned ? `Earned: ${featNames[feat.kind]}.` : `Missed ${levelFeatText(feat)}`;

export const levelNumberText = (id: number): string => `Level ${id}`;
export const lockedLevelText = (id: number): string => `Win level ${id} first`;
export const starSlots = (earned: number, total = 3): string => `${earned} of ${total} stars`;

export const tipsHeading = (id: number): string => `Level ${id} tips`;

const manualWaveTip = `The first and last waves wait for ${START_WAVE_TEXT}.`;

function thirdStarTip(id: number): string {
  const feat = LEVELS.find(level => level.id === id)!.feat!;
  switch (feat.kind) {
    case 'maxTowers': return `Once you build ${feat.limit} towers, upgrade them for the third star.`;
    case 'noSpecials': return 'Leave specials unused for the third star.';
    case 'noLeaks': return 'Guard every exit for the third star.';
    case 'noRepairs': return 'Win without buying a repair for the third star.';
    case 'unbroken': return 'Keep the gate standing for the third star.';
  }
}

function campaignTips(touch: boolean): Readonly<Record<number, readonly string[]>> {
  const action = touch ? 'Tap' : 'Click';
  return {
    1: [touch ? 'Tap a tower, then tap a square by the trail twice.' : 'Click a tower, then click a square by the trail.', `Press ${START_WAVE_TEXT} to let the Goblin Collectors in.`, `${action} ${SPECIAL_BUTTON_TEXT}, then ${action.toLowerCase()} the trail to hit a pack.`],
    2: ['Build a Cannon beside a bend.', 'Each blast hits Goblin Collectors that stand close together.'],
    3: ['Put a Tar Pit beside the trail to slow fast Revenue Hounds.', 'Build towers nearby to hit them as they slow down.'],
    4: ['Slow the Redcoat Shieldbearers with a Tar Pit.', 'Put a Fire Pot nearby. Tar makes the fire burn harder.'],
    5: ['Longbows and Musketeers can hit flying Royal Harpies.', 'Fire Pots can hit Royal Harpies, but the fire won’t stick.', 'Drop a Tar Barrel on a crowd to slow it down.'],
    6: ['A Mortar shoots far but takes time between shots.', 'Aim at slow Toll Trolls. Keep bows for Royal Harpies.', 'It cannot hit enemies right beside it.'],
    7: [`${action} ${SPECIAL_BUTTON_TEXT} and choose Barricade.`, `${action} the trail ahead of a pack, near your towers.`, 'The wall holds walkers still while your towers fire.'],
    8: ['Send Guards ahead of a pack of Redcoat Shieldbearers.', 'Place them on the trail where your towers can help.', 'Drop Fire Arrows on a crowd to burn it.'],
    9: [`${action} a tower you have upgraded once.`, 'Pick an upgrade before Assessor Grumblefoot arrives.', 'Feathers make tarred enemies run back. Bosses are too proud.'],
    10: ['King Grumblemaw calls Revenue Hounds. Save a Powder Keg.', 'Slow King Grumblemaw with tar, then hit him with fire.'],
    11: [
      'First tower is untaxed. Sold towers still count for tax.',
      'Drop a Tar Barrel on a crowd and they run back.',
      `After a feather barrel, specials take ${featherBarrelWait} to return.`,
    ],
    12: ['Put a Tar Pit where several towers can reach it.', 'Save a special for the pack that gets ahead.'],
    13: ['Plan your next purchase before the wave ends.', 'The clock waits while you choose a reward.', manualWaveTip],
    14: ['Check the ring before you build.', 'Keep the Mortar back. Its inner ring stays put.'],
    15: ['Kills pay nothing. Budget for the next wave.', 'Calling early still earns its bonus.'],
    16: ['Upgrades take no permit. Selling frees one.', thirdStarTip(16)],
    17: ['Pick a bend where a short shot covers nearby turns.', thirdStarTip(17), manualWaveTip],
    18: [`Place your ${levelTaxWord(18, 'rationing')} towers where their rings overlap.`, 'Upgrade them to keep up with the faster packs.'],
    19: ['Check the shorter ring before you buy.', 'An upgrade costs the usual price.'],
    20: ['Keep bows near the trail to cover Royal Harpies.', 'Save part of each payment for the King.'],
    21: ['Use high ground to reach farther. The wall is ours.', 'Mend the gate between waves. Keep bows for Royal Harpies.', 'Gate down? Towers fire double for a moment. Hold the yard.'],
    22: [`${action} a lit window: tar and feathers on the crowd below.`, 'One pillow per window. Make the King count them.'],
    23: ['We paid for both roads. Put towers on both.', 'The Survey closes wall spots. Use the open spots.'],
    24: ['Pay off the Redcoat in setup to build on his spot.', 'He eats for free. Pay him off only if you need the spot.'],
    25: ['Tar and feather the Ram. Return the notice to sender.', 'Keep towers in reach of the gate for the King.'],
  };
}

const mouseTips = campaignTips(false);
const touchTips = campaignTips(true);
export const levelTips = (id: number, touch: boolean): readonly string[] => (touch ? touchTips : mouseTips)[id];

/** Hidden Meadow benchmark readout, ordered from lowest to highest detail. */
export const SHOWPIECE_DETAIL = ['Detail · Low', 'Detail · Medium', 'Detail · High'] as const;

const ROAD_NAMES: Readonly<Record<string, string>> = { east: 'East', west: 'West' };

export function roadName(id: string): string {
  return ROAD_NAMES[id] ?? id;
}

export const SIEGE_TEXT = {
  next: 'Next:',
  road: (id: string) => `${roadName(id)} road`,
  roadCount: (count: number, type: EnemyType) => `${count} ${ENEMY_SHORT_NAMES[type]}`,
  window: 'Window',
  emptyWindow: 'No targets',
  spentWindow: 'Spent',
  quartering: 'Quartered',
  survey: 'Surveyed',
  condemned: 'CONDEMNED',
  pay: (gold: number) => `Pay ${gold}`,
} as const;

export function siegeRuleLines(level: Pick<LevelDef, 'wallSiteTax' | 'windows'>): string[] {
  const lines: string[] = [];
  const tax = level.wallSiteTax;
  if (tax?.kind === 'royalSurvey') {
    const count = tax.sites.length;
    lines.push(`Royal Survey: ${count === 1 ? 'one wall spot is' : `${count} wall spots are`} closed.`);
  }
  if (tax?.kind === 'quartering') lines.push(`Quartering: a Redcoat holds a wall spot until paid ${tax.price} gold.`);
  if (level.windows?.length) lines.push("Town's answer: tap a lit window for feathers.");
  return lines;
}
