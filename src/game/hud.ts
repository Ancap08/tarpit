// HUD: a dark bar across the bottom 100 px of the 960 x 580 canvas, in two
// rows. Row 1: gold, lives, wave, the next-wave preview, a Start Wave button
// and a 1x/2x speed toggle, buttons at y 484..526. Row 2: the build bar,
// buttons at y 533..575. Buttons are 42 px tall (milestone 14) so they are
// at least 44 px on an iPad in landscape (scale 1024 / 960).
// Milestone 23: the boss bar (ui/bossBar.ts) at the top of the map while
// the boss lives, and the wave 10 preview ends with "+ Grumblefoot".
// Milestone 25: on Easy or Hard a small muted level tag ("Easy", "Hard")
// sits under the wave counter, which moves up 7 px to make room; on Normal
// there is no tag and the counter stays centred, so Normal frames are as
// before. (The 128 px between the wave counter and the preview cannot hold
// "Wave 10/10" and a tag on one line.)
// Milestone 25b: row 1 gains a Special button left of Start Wave: Special
// x 630 (100 wide), Start Wave x 738 (130), speed x 876 (70), 8 px apart;
// the preview moves to x 356 and narrows to 264 px (to x 620). The Special
// button is lit while a charge can be used (a wave is running and the
// charge is unspent) with a bright pip, greyed with an empty pip otherwise;
// it shows as picked while its popup is open or a special is being aimed.
// The popup (ui/specialMenu.ts) opens above it.
// Milestone 25c: while a wave runs and the next wave can be called early
// (callEarlyStatus), Start Wave reads "Call next  +14" (names.ts, 14 px so
// it fits the 130 px button) with the current early bonus, and pressing it
// calls the next wave; otherwise it reads "Start Wave" as before.
// Milestone 26: in an endless game the wave counter reads "Wave 11" (no
// "/10") and the preview shows the generated wave; a type that comes in two
// groups (an endless wave's extra Harpies) is listed once with the sum.
// Milestone 30: while the special charge recharges the Special button is
// greyed, a fill grows from its left edge under the label, and the label is
// the countdown ("Wait 12s"); ready, its pip is lit (and pulses in play). The speed
// button reads "3x" while held. The Gold readout is a tap target
// (GOLD_RECT, for the gold cheat) and shows CHEAT_MARK under it once the
// cheat was used.
// Milestone 45: Pause occupies the right end of the counter. In landscape
// speed sits above mute beside it; in portrait mute sits to its left.

import { coin, panel, THEME } from './ui/theme';
import Phaser from 'phaser';
import {
  callEarlyStatus,
  hasNextWave,
  isBoss,
  ordinaryRechargeTicks,
  lastWave,
  TICKS_PER_SECOND,
  nextWavePreview,
  availableSpecials,
  type Difficulty,
  type EnemyType,
  type GameState,
  type SpecialType,
  type TowerType,
} from '../sim';
import type { Rect } from './input';
import type { TowerIcon } from './skin/painted';
import {
  BOON_PENDING_TEXT,
  CAMPAIGN_TEXT,
  PANEL_TEXT,
  BOON_WAVE_TEXT,
  BOSS_WAVE_NEXT_TEXT,
  LAST_WAVE_TEXT,
  LEVEL_NAMES,
  autoWaveText,
  taxStatusText,
  callEarlyLabel,
  levelNumberText,
  OLD_KEEP_NAME,
  blockedWaveLabel,
  CHEAT_MARK,
  DIFFICULTY_LABELS,
  ENEMY_SHORT_NAMES, roadName, SIEGE_TEXT, siegeRuleLines, cardFeatText,
  rechargeText,
  PAUSE_TEXT,
  SPECIAL_BUTTON_TEXT,
  speedLabel,
  START_WAVE_TEXT,
  waveCounterText, waveNumberText, HUD_STAT_LABELS,
} from './names';
import { COLORS, FONT, HUD_FONT, TEXT } from './palette';
import { BossBar } from './ui/bossBar';
import { BuildBar } from './ui/buildBar';
import { Button } from './ui/button';
import { GateHud } from './ui/gateHud';
import { PORTRAIT_STACK, portraitRow2, STACK_SIZE, stripAimText, type StackSize } from './ui/geometry';
import {
  CLEAN_BUILD_H,
  LANDSCAPE,
  PORTRAIT,
  PORTRAIT_GAP,
  TAXED_PORTRAIT,
  PORTRAIT_STRIP_H,
  PORTRAIT_WIDTH,
  type Layout,
} from './layout';
import { SpecialMenu } from './ui/specialMenu';
import { MuteButton } from './ui/muteButton';
import { BakedPaint, CLEAN, battleFont, battleWeight, glyph, roundPoints, rounded, sans, skinFor, textMetrics } from './ui/newTheme';
import { DeviceTextFit, minimumTextSize, textInset, textSlot } from './ui/deviceText';
import { CleanReadouts, PHONE_TOP_CONTROL_CENTER, cleanHudMetrics, permitSlot, statColumns } from './ui/cleanHud';

export type { Rect };

export const HUD_TOP = 480;
export const HUD_HEIGHT = 100;
/**
 * Every HUD button is 42 px tall: 44.8 px on screen at iPad landscape scale
 * (1024 / 960), over the 44 px touch target. The 100 px HUD keeps a 4 px gap
 * under its top edge, 7 px between the rows and 5 px at the bottom.
 */
export const HUD_BUTTON_H = 42;
export const ROW1_BUTTON_Y = HUD_TOP + 4;
export const ROW2_BUTTON_Y = ROW1_BUTTON_Y + HUD_BUTTON_H + 7;
/** Vertical centre of row 1 (the stats and the HUD buttons). */
const MID = ROW1_BUTTON_Y + HUD_BUTTON_H / 2;
const BUTTON_H = HUD_BUTTON_H;

export interface HudStrings {
  gold: string;
  /** Milestone 30: "Special", or the countdown ("Wait 12s") while the charge refills. */
  special: string;
  /** Milestone 30: CHEAT_MARK once the gold cheat was used, else ''. */
  cheat: string;
  lives: string;
  wave: string;
  next: string;
  startWave: string;
  speed: string;
  /** The boss bar's label ("Grumblefoot 4000 / 4000") while it shows, else null. */
  boss: string | null;
  /** The level tag under the wave counter ("Easy", "Hard"), or '' on Normal (milestone 25). */
  difficulty: string;
}

/** The HUD's level tag: the level's name, or '' on Normal (no tag). */
export function difficultyTag(difficulty: Difficulty): string {
  return difficulty === 'normal' ? '' : DIFFICULTY_LABELS[difficulty];
}

/** The wave counter's y shift and the tag's y offset from row 1's centre when a tag shows. */
export const WAVE_TAG_SHIFT = -9;
export const TAG_OFFSET = 12;
export const TAG_SIZE = 12;

/**
 * "Next: 8 Collector", "Next: 8 Collector, 5 Hound" (names from ENEMY_SHORT_NAMES), or
 * "Next: none" after the last wave. A wave with the boss lists its other
 * groups, then " + Grumblefoot", with no count.
 */
export function previewText(state: GameState): string {
  const groups = nextWavePreview(state);
  if (groups.length === 0) return 'Next: none';
  if (groups.some(group => group.road !== undefined)) {
    const byRoad = new Map<string, Map<EnemyType, number>>();
    for (const group of groups) {
      const road = group.road ?? state.map.mainRoad ?? '';
      const counts = byRoad.get(road) ?? new Map<EnemyType, number>();
      counts.set(group.type, (counts.get(group.type) ?? 0) + group.count);
      byRoad.set(road, counts);
    }
    const labels = [...byRoad].map(([road, counts]) => {
      const entries = [...counts].map(([type, count]) => `${count} ${ENEMY_SHORT_NAMES[type]}`);
      return `${roadName(road)} ${entries.join(', ')}`;
    });
    return `${SIEGE_TEXT.next} ${labels.join(' · ')}`;
  }
  // Milestone 26: one entry per type, in first-group order, counts summed
  // (an endless wave's extra Harpy group joins the base wave's Harpies).
  const counts = new Map<EnemyType, number>();
  for (const g of groups) if (!isBoss(g)) counts.set(g.type, (counts.get(g.type) ?? 0) + g.count);
  const bossGroup = groups.find(isBoss);
  const boss = bossGroup ? ` + ${ENEMY_SHORT_NAMES[bossGroup.type]}` : '';
  return `Next: ${[...counts].map(([type, count]) => `${count} ${ENEMY_SHORT_NAMES[type]}`).join(', ')}${boss}`;
}

/** Wave controls and mute sit beside the pause plaque at the end of the counter. */
export const SPECIAL_BUTTON = { x: 586, width: 100 } as const;
export const START_BUTTON = { x: 692, width: 130 } as const;
export const SPEED_BUTTON = { x: 828, width: 42 } as const;
export const MUTE_BUTTON = { x: 828, width: 42 } as const;
/** The Special button's charge pip: radius, and its centre's distance from the button's right edge. */
export const PIP_RADIUS = 5;
export const PIP_INSET = 14;
/** The Gold readout's tap area (milestone 30, the gold cheat): row 1 from x 8, 104 wide. */
export const GOLD_RECT = { x: 8, y: HUD_TOP + 4, width: 104, height: 42 } as const;
/** Gold taps for the cheat: this many within CHEAT_WINDOW_MS. */
export const CHEAT_TAPS = 5;
export const CHEAT_WINDOW_MS = 2000;

/** Keep the original line breaks and fit the longest lines beside Special. */
export const PREVIEW_X = 356;
export const PREVIEW_WIDTH = 264;
export const PREVIEW_SIZE = 16;
export const PREVIEW_SIZE_LONG = 13;
/** Milestone 25c: the horde's wave 10 preview needs three lines at 13 px; at 11 px it fits two. */
export const PREVIEW_SIZE_LONGEST = 11;

/**
 * Lines `text` takes when word-wrapped greedily to PREVIEW_WIDTH at `size`
 * px (Courier New advances 0.6 em per character, so no text measuring).
 */
export function previewLines(text: string, size: number, width = PREVIEW_WIDTH): number {
  const perLine = Math.floor(width / (0.6 * size));
  let lines = 1;
  let used = 0;
  for (const word of text.split(' ')) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) used = need;
    else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/**
 * The preview's font size: 16 px when the text fits PREVIEW_WIDTH on one
 * line, else 13 px wrapped to two lines (milestone 23; the wave 10 preview
 * with "+ Grumblefoot" is 61 characters, and the longer milestone 22
 * previews already ran under the Start Wave button), else 11 px on two
 * lines (milestone 25c: "Next: 20 Wolf, 13 Troll, 12 Harpy, 8
 * Shieldbearer + Grumblefoot" wraps to three lines at 13 px).
 */
export function previewSize(text: string): number {
  if (text.length * 0.6 * PREVIEW_SIZE <= PREVIEW_WIDTH) return PREVIEW_SIZE;
  return previewLines(text, PREVIEW_SIZE_LONG) <= 2 ? PREVIEW_SIZE_LONG : PREVIEW_SIZE_LONGEST;
}

/** Start Wave does something only in setup with waves left (always, in an endless game). */
export function canStartWave(state: GameState): boolean {
  return state.phase === 'setup' && !state.pendingBoon && hasNextWave(state);
}

/** Start Wave's label size: 18 px, or 14 px while it reads the call-early label (milestone 25c). */
export const START_LABEL_SIZE = '18px';
export const CALL_LABEL_SIZE = '14px';

/** Call early (milestone 25c): whether the next wave can be called now, and the bonus it would pay. */
export function callEarlyInfo(state: GameState): { available: boolean; bonus: number } {
  const status = callEarlyStatus(state);
  return status.ok ? { available: true, bonus: status.bonus } : { available: false, bonus: 0 };
}

/** A special can be used now: a wave is running and its charge is ready (milestone 25b; 30: it recharges). */
export function specialReady(state: GameState): boolean {
  return state.phase === 'wave' && state.specialCharges > 0;
}

/**
 * The Special button shows the share refilled and the whole seconds left.
 * A barrel wait remains visible and stationary during setup.
 */
export function specialRecharge(state: GameState): { progress: number; seconds: number } | null {
  const pausedWait = state.phase === 'setup' && state.barrelRecharge;
  if ((state.phase !== 'wave' && !pausedWait) || state.specialCharges > 0 || state.specialRechargeTicks <= 0) return null;
  return {
    progress: 1 - state.specialRechargeTicks / (state.barrelRecharge?.totalTicks ?? ordinaryRechargeTicks(state.boons)),
    seconds: Math.ceil(state.specialRechargeTicks / TICKS_PER_SECOND),
  };
}

/** What GameScene shows of the specials (milestone 25b): the popup and the special being aimed. */
export interface HudSpecial {
  paused?: boolean;
  menuOpen: boolean;
  aiming: SpecialType | null;
  /** 32b follow-up: the aim banner's words while aiming; portrait shows them in the strip. */
  banner?: { main: string; hint: string } | null;
}


export interface HudHandlers {
  onRepair?: () => void;
  /** Start Wave was pressed: starts the wave in setup, or calls the next one early (milestone 25c). */
  onStartWave: () => void;
  onPause: () => void;
  onToggleSpeed: () => void;
  /** A press started on the speed button (milestone 30: held 300 ms it runs 3x). */
  onSpeedPress?: () => void;
  /** A build bar button was clicked (only when pickable). */
  onPick: (type: TowerType) => void;
  /** The Special button was pressed (only while specialReady). */
  onSpecial: () => void;
  /** A special was picked in the popup. */
  onSpecialPick: (type: SpecialType) => void;
}

/** The Lives readout's left edge. */
const LIVES_X = 126;
const GOLD_LABEL_X = 24;

/**
 * Where everything in the HUD goes (milestone 32b). Landscape: the
 * milestone 14 to 30 bar under the map, exactly as before. Portrait: a
 * status strip over the map (gold, lives, the wave and level tag in a row,
 * the cheat mark at its right end, the preview on up to two lines under
 * them) and the controls under the map (layout.ts).
 */
export interface HudMetrics {
  portrait: boolean;
  /** HUD backgrounds and their edge lines. */
  bands: Rect[];
  lines: Rect[];
  /** Row of stats: centre y and font size. */
  statY: number;
  statSize: string;
  goldX: number;
  /** Portrait: gap between the stats, which follow each other's widths (else fixed x). */
  flowGap: number;
  preview: { x: number; y: number; width: number; originY: number };
  cheat: { x: number; y: number; size: string; originX: number };
  gold: Rect;
  special: Rect;
  start: Rect;
  speed: Rect;
  /** Milestone 33: the mute button. */
  mute: Rect;
  pause: Rect;
  specialFont: string;
  startFont: string;
  callFont: string;
  menu: { left: number; top: number; size: StackSize; font: string };
  barTop: number;
}

export const LANDSCAPE_HUD: HudMetrics = {
  portrait: false,
  bands: [{ x: 0, y: HUD_TOP, width: 960, height: HUD_HEIGHT }],
  lines: [{ x: 0, y: HUD_TOP, width: 960, height: 2 }],
  statY: MID,
  statSize: '18px',
  goldX: GOLD_LABEL_X,
  flowGap: 0,
  preview: { x: PREVIEW_X, y: MID, width: SPECIAL_BUTTON.x - PREVIEW_X - 8, originY: 0.5 },
  cheat: { x: GOLD_LABEL_X, y: MID + 12, size: '11px', originX: 0 },
  gold: { ...GOLD_RECT },
  special: { ...SPECIAL_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H },
  start: { ...START_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H },
  speed: { ...SPEED_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H },
  mute: { ...MUTE_BUTTON, y: ROW2_BUTTON_Y, height: BUTTON_H },
  pause: { x: 876, y: HUD_TOP + 10, width: 80, height: 80 },
  specialFont: '16px',
  startFont: START_LABEL_SIZE,
  callFont: CALL_LABEL_SIZE,
  menu: { left: SPECIAL_BUTTON.x, top: HUD_TOP, size: STACK_SIZE, font: '16px' },
  barTop: ROW2_BUTTON_Y,
};

function portraitHud(layout: Layout): HudMetrics {
  const { special, start, speed, mute, pause } = portraitRow2(1, layout);
  const taxed = layout === TAXED_PORTRAIT;
  const size = taxed ? '21px' : '20px';
  const stripHeight = layout.map.y;
  const controlsY = stripHeight + layout.map.height;
  return {
    portrait: true,
    bands: [
      { x: 0, y: 0, width: PORTRAIT_WIDTH, height: stripHeight },
      { x: 0, y: controlsY, width: PORTRAIT_WIDTH, height: layout.height - controlsY },
    ],
    lines: [
      { x: 0, y: stripHeight - 2, width: PORTRAIT_WIDTH, height: 2 },
      { x: 0, y: controlsY, width: PORTRAIT_WIDTH, height: 2 },
    ],
    statY: 15,
    statSize: size,
    goldX: 6,
    flowGap: taxed ? 8 : 14,
    preview: { x: 6, y: taxed ? 58 : 28, width: PORTRAIT_WIDTH - 12, originY: 0 },
    cheat: { x: PORTRAIT_WIDTH - 6, y: taxed ? 42 : 15, size, originX: 1 },
    gold: { x: 0, y: 0, width: 120, height: 30 },
    special,
    start,
    speed,
    mute,
    pause,
    specialFont: '23px',
    startFont: '23px',
    callFont: taxed ? '21px' : '23px',
    menu: { left: special.x, top: controlsY, size: PORTRAIT_STACK, font: size },
    barTop: controlsY + PORTRAIT_GAP,
  };
}

export const PORTRAIT_HUD = portraitHud(PORTRAIT);

export function hudMetrics(layout: Layout): HudMetrics {
  if (layout === TAXED_PORTRAIT) return portraitHud(layout);
  return layout.turned ? PORTRAIT_HUD : LANDSCAPE_HUD;
}

export class Hud {
  private readonly gold: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly taxLine: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly specialButton: Button;
  private readonly pip: Phaser.GameObjects.Graphics;
  /** The recharge fill over the Special button (milestone 30). */
  private readonly rechargeFill: Phaser.GameObjects.Graphics;
  private readonly cheatMark: Phaser.GameObjects.Text;
  private readonly specialMenu: SpecialMenu;
  private pipKey = '';
  private readonly bar: BuildBar;
  private readonly bossBar: BossBar;
  private readonly gate?: GateHud;
  private readonly pauseAction: HTMLButtonElement;
  private readonly pauseIcon: Phaser.GameObjects.Graphics;
  private readonly siegeCounter?: Phaser.GameObjects.Graphics;
  private readonly pauseButton: Button;
  private readonly muteButton: MuteButton;
  private readonly m: HudMetrics;
  /** The Lives readout's left edge now (portrait: after the gold), for the exit shake. */
  private livesX = LIVES_X;
  private siegeExpanded?: boolean;
  private readonly clean?: CleanReadouts;
  private modernTag = '';
  private previewMemo?: { wave: number; endless: boolean; level: GameState['level']; waves: GameState['fixedWaves']; text: string };
  private readonly readyState?: Phaser.GameObjects.Text;
  private readonly taxGlyph?: Phaser.GameObjects.Graphics;
  private readonly taxFit = new DeviceTextFit();
  private readonly previewFit = new DeviceTextFit();
  private readonly cheatFit = new DeviceTextFit();
  private readonly readyFit = new DeviceTextFit();
  private readonly featFit = new DeviceTextFit();
  private readonly featLine?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, handlers: HudHandlers, private readonly layout: Layout = LANDSCAPE, towerIcon?: TowerIcon, private readonly pauseOnResult = false, private readonly siegeScreens = false, spawn?: { x: number; y: number }) {
    const modern = skinFor(scene) === 'battle';
    const m = modern ? cleanHudMetrics(layout, hudMetrics(layout), siegeScreens) : { ...hudMetrics(layout) };
    if (this.siegeScreens && m.portrait && !modern) m.statY = 20;
    this.m = m;
    const counter = scene.add.graphics();
    const backing = modern ? new BakedPaint(scene, counter) : undefined;
    if (backing) backing.begin(m.bands[0]);
    for (const [i, band] of m.bands.entries()) {
      if (this.siegeScreens && !modern && m.portrait && i === 0) {
        this.siegeCounter = scene.add.graphics();
        this.drawSiegeCounter(false);
        continue;
      }
      if (modern) {
        if (i === 0) rounded(counter, band, CLEAN.panel, CLEAN.edge, 22);
        else {
          const dock = new BakedPaint(scene, scene.add.graphics());
          const g = dock.begin(band);
          g.fillStyle(CLEAN.ground).fillRect(band.x, band.y, band.width, band.height);
          rounded(g, m.portrait
            ? { x: 4, y: m.barTop - 2, width: layout.width - 8, height: CLEAN_BUILD_H + 2 }
            : { x: 12, y: m.barTop - 2, width: 595, height: 69 });
          dock.image.setName('clean-dock');
          dock.finish();
        }
        continue;
      }
      panel(counter, band, THEME.wood);
      // Fine horizontal grain follows the counter, clear of the printed labels.
      for (const offset of [3, 5, band.height - 5]) {
        counter.lineStyle(1, THEME.brass, 0.22)
          .lineBetween(band.x + 5, band.y + offset, band.x + band.width - 5, band.y + offset);
      }
    }
    for (const [i, l] of m.lines.entries()) {
      if (this.siegeCounter && i === 0) continue;
      scene.add.rectangle(l.x, l.y, l.width, l.height, COLORS.hudLine).setOrigin(0, 0);
    }

    if (modern) {
      this.clean = new CleanReadouts(scene, m, counter);
      backing!.image.setName('clean-status');
      backing!.finish();
    }
    const stat = (x: number, size = m.statSize, color: string = TEXT.hud) =>
      scene.add.text(x, m.statY, '', { fontFamily: modern ? battleFont() : FONT, fontSize: size, fontStyle: modern ? battleWeight(true) : 'bold', color }).setOrigin(0, 0.5);
    const fixedStat = (x: number, size: number, color: string) => {
      const descent = Math.ceil(size / 5);
      const height = modern ? size + 3 : size + descent;
      return scene.add.text(x, m.statY, '', {
        fontFamily: modern ? battleFont() : HUD_FONT, fontSize: size, fontStyle: modern ? battleWeight(true) : 'bold', color, fixedHeight: height,
        metrics: modern ? textMetrics(size) : { ascent: size, descent, fontSize: height },
      }).setOrigin(0, 0.5);
    };
    const statSize = Number.parseInt(m.statSize, 10);
    if (!modern && !m.portrait) coin(counter, 13, m.statY, 5);
    this.gold = fixedStat(m.goldX, statSize, TEXT.hud);
    this.lives = fixedStat(LIVES_X, statSize, TEXT.hud);
    this.wave = fixedStat(238, statSize, TEXT.hud);
    this.tag = fixedStat(238, m.portrait ? statSize : TAG_SIZE, TEXT.hudDim);
    this.taxLine = fixedStat(m.portrait ? 6 : 8, m.portrait ? 23 : 14, TEXT.hud)
      .setName('active-taxes').setY(m.portrait ? 42 : MID + 14).setVisible(false);
    if (!m.portrait) this.tag.setY(MID + TAG_OFFSET);
    this.next = m.portrait
      ? stat(m.preview.x, m.statSize, TEXT.hudDim).setY(m.preview.y).setOrigin(0, m.preview.originY).setWordWrapWidth(m.preview.width, true)
      : stat(PREVIEW_X, `${PREVIEW_SIZE}px`, TEXT.hudDim).setWordWrapWidth(PREVIEW_WIDTH, true);
    this.next.setName('wave-preview');
    if (modern) {
      const [, livesX, waveX] = statColumns(m);
      this.gold.setColor(CLEAN.gold);
      this.lives.setX(livesX).setColor(CLEAN.ink);
      this.wave.setX(waveX).setColor(CLEAN.ink);
      this.tag.setVisible(false);
      const size = m.portrait ? 25 : 14;
      this.taxLine.setPosition(m.preview.x + (m.portrait ? 25 : 17), m.portrait ? m.preview.y - 30 : m.bands[0].y + 16)
        .setOrigin(0).setStyle({ fontSize: size, color: CLEAN.subdued, metrics: textMetrics(size), fontStyle: battleWeight(false) })
        .setFixedSize(0, 0).setWordWrapWidth(m.preview.width - (m.portrait ? 25 : 17));
      this.next.setPosition(m.preview.x, m.preview.y).setOrigin(0).setWordWrapWidth(m.preview.width)
        .setStyle({ fontSize: m.portrait ? 24 : 14, metrics: textMetrics(m.portrait ? 24 : 14), color: CLEAN.subdued, fontStyle: battleWeight(false) });
      if (siegeScreens) {
        // Preview above the rules on a phone. The desktop puts the rules alongside the crest and stats.
        this.taxLine.setPosition(m.preview.x + (m.portrait ? 28 : 18), m.portrait ? 137 : 10);
        this.featLine = sans(scene, m.portrait ? m.preview.x + 28 : 33, m.portrait ? 165 : 92, '',
          m.portrait ? 22 : 14, CLEAN.gold).setName('siege-feat').setVisible(false);
        glyph(counter, 'sparkle', this.featLine.x - (m.portrait ? 18 : 11), this.featLine.y + (m.portrait ? 13 : 8),
          m.portrait ? 20 : 14, 0xffda92);
        this.next.setWordWrapWidth(m.preview.width, true);
      }
    }

    // The Special label is left-aligned (an empty right label) so the pip fits on its right.
    this.specialButton = new Button(scene, m.special, SPECIAL_BUTTON_TEXT, handlers.onSpecial, {
      fontSize: m.specialFont,
      labelInset: m.portrait ? 4 : undefined,
      right: modern ? undefined : '',
      icon: modern ? 'bolt' : undefined,
    });
    // The recharge fill sits over the button's box and under its label.
    const sb = m.special;
    if (modern) {
      this.readyState = sans(scene, sb.x + sb.width / 2 + 14, sb.y + sb.height * .72,
        PANEL_TEXT.ready, m.portrait ? 25 : 14, '#aaf1d9', true).setOrigin(.5).setVisible(false);
      this.taxGlyph = scene.add.graphics().setVisible(false);
      glyph(this.taxGlyph, 'window', m.preview.x + 8, this.taxLine.y + (m.portrait ? 12 : 7), m.portrait ? 21 : 14, CLEAN.rose);
    }
    this.rechargeFill = scene.add.graphics();
    scene.children.moveBelow(this.rechargeFill, this.specialButton.labelObjects[0]);
    this.pip = scene.add.graphics();
    this.cheatMark = scene.add
      .text(m.cheat.x, m.cheat.y, CHEAT_MARK, { fontFamily: modern ? battleFont() : FONT, fontSize: m.cheat.size, fontStyle: modern ? battleWeight(false, 'bold') : 'bold', color: modern ? '#ffb0a7' : TEXT.cheatMark, ...(modern ? { metrics: textMetrics(parseInt(m.cheat.size)) } : {}) })
      .setOrigin(m.cheat.originX, 0.5)
      .setVisible(false);
    if (layout === TAXED_PORTRAIT) {
      this.cheatMark.setStyle({ metrics: { ascent: statSize, descent: 4, fontSize: statSize + 4 } });
      this.next.setStyle({ metrics: { ascent: 18, descent: 6, fontSize: 24 } });
    }
    // Milestone 33: Start Wave's own sound is the horn (or Call next's), so its click plays no tap.
    this.startButton = new Button(scene, m.start, START_WAVE_TEXT, handlers.onStartWave,
      modern ? { fontSize: m.startFont, primary: true, icon: 'play', sound: null }
        : m.portrait ? { fontSize: m.startFont, sound: null } : { sound: null });
    if (m.portrait) {
      // Stack the boss warning by word and give the taxed last-wave notice the same room.
      const wrapWidth = m.start.width - 6;
      this.startButton.labelObjects[0]
        .setStyle({ metrics: { ascent: 23, descent: 6, fontSize: 29 } })
        .setWordWrapCallback((text, label) => {
          if (text === BOSS_WAVE_NEXT_TEXT || (layout === TAXED_PORTRAIT && text === LAST_WAVE_TEXT))
            return text.split(' ');
          return label.advancedWordWrap(text, label.context, wrapWidth);
        });
    }
    this.speedButton = new Button(scene, m.speed, '1x', handlers.onToggleSpeed, { onPress: handlers.onSpeedPress, semibold: true, fontSize: modern && m.portrait ? '26px' : modern || m.portrait ? m.startFont : undefined });
    this.specialMenu = new SpecialMenu(scene, m.menu.left, m.menu.top, handlers.onSpecialPick, layout.map.y, m.menu.size, m.menu.font);
    this.bar = new BuildBar(scene, m.barTop, handlers.onPick, layout, towerIcon, modern && m.portrait ? permitSlot(m) : undefined);
    this.bossBar = new BossBar(scene, layout, spawn, siegeScreens);
    if (handlers.onRepair) this.gate = new GateHud(scene, layout, handlers.onRepair, siegeScreens);
    this.muteButton = new MuteButton(scene, m.mute, modern && m.portrait ? PHONE_TOP_CONTROL_CENTER : undefined);
    this.pauseButton = new Button(scene, m.pause, m.portrait ? '' : PAUSE_TEXT.button, handlers.onPause, {
      bare: modern, fontSize: modern ? '14px' : '18px', labelY: modern ? 34 : 57, sound: null,
    });
    this.pauseIcon = scene.add.graphics().fillStyle(COLORS.buttonEdgePicked);
    const iconHeight = m.portrait ? 26 : 21;
    if (modern) glyph(this.pauseIcon, 'pause', 0, m.portrait ? 0 : 4, m.portrait ? 29 : 20, 0xe2f5ee);
    else for (const x of [-11, 4]) this.pauseIcon.fillRect(x, 0, 7, iconHeight);
    // Put the native accessibility target over the plaque. Phaser handles pointer input.
    this.pauseAction = document.createElement('button');
    this.pauseAction.textContent = PAUSE_TEXT.button;
    this.pauseAction.onclick = handlers.onPause;
    this.pauseAction.className = 'pause-action';
    scene.game.canvas.after(this.pauseAction);
    const fitControls = () => {
      const { canvasBounds: b, displayScale: s } = scene.scale;
      if (m.portrait && !modern) {
        const row = portraitRow2(1 / Math.max(s.x, s.y), layout);
        if (row.pause.width !== m.pause.width) {
          Object.assign(m, row);
          this.startButton.setWidth(row.start.width);
          this.speedButton.moveTo(row.speed.x, row.speed.y);
          this.muteButton.setRect(row.mute);
          this.pauseButton.setSize(row.pause.width, row.pause.height);
          this.pauseButton.moveTo(row.pause.x, row.pause.y);
        }
      }
      this.pauseIcon.setPosition(m.pause.x + m.pause.width / 2,
        m.pause.y + (modern ? m.portrait ? PHONE_TOP_CONTROL_CENTER : 10 : m.portrait ? (m.pause.height - iconHeight) / 2 : 16));
      Object.assign(this.pauseAction.style, {
        left: (b.x + m.pause.x / s.x) + 'px', top: (b.y + m.pause.y / s.y) + 'px',
        width: (m.pause.width / s.x) + 'px', height: (m.pause.height / s.y) + 'px',
      });
    };
    fitControls();
    scene.scale.on('resize', fitControls);
    scene.events.once('shutdown', () => {
      scene.scale.off('resize', fitControls);
      this.pauseAction.remove();
    });
  }

  private drawSiegeCounter(expanded: boolean): void {
    if (!this.siegeCounter || expanded === this.siegeExpanded) return;
    this.siegeExpanded = expanded;
    const { x, y, width } = this.layout.map;
    const height = expanded ? y : 38;
    panel(this.siegeCounter.clear(), { x, y: 0, width, height }, THEME.wood);
    this.siegeCounter.lineStyle(1, THEME.brass, .22).lineBetween(x + 5, height - 5, x + width - 5, height - 5);
  }

  /**
   * Milestone 31 (play only): an enemy got through. `flash` > 0 shows the
   * Lives number in red; `dx` shakes it sideways by that many px.
   */
  livesFx(flash: number, dx: number): void {
    if (this.clean) return;
    this.lives.setColor(flash > 0 ? TEXT.livesFlash : TEXT.hud).setX(this.livesX + dx);
  }

  /** `nowMs`: the clock in play, for the ready pip's pulse; left out in test mode (no pulse). */
  update(state: GameState, speed: 1 | 2 | 3, pick: TowerType | null, special: HudSpecial = { menuOpen: false, aiming: null }, nowMs?: number): void {
    const m = this.m;
    const set = (t: Phaser.GameObjects.Text, s: string) => {
      if (t.text !== s) t.setText(s);
    };
    const count = (label: Phaser.GameObjects.Text, value: string) => this.clean ? this.clean.count(label, value) : set(label, value);
    count(this.gold, this.clean ? String(state.gold) : `${HUD_STAT_LABELS[0]} ${state.gold}`);
    this.cheatMark.setVisible(state.cheated);
    // The sim lets lives go below 0 (the boss's exit costs 5); the HUD shows 0.
    count(this.lives, this.clean ? String(Math.max(0, state.lives)) : `${HUD_STAT_LABELS[1]} ${Math.max(0, state.lives)}`);
    set(this.wave, (this.clean ? waveNumberText : waveCounterText)(state.wave, state.endless, lastWave(state)));
    const tag = state.map.id === 'keep' && !this.clean ? OLD_KEEP_NAME : state.level ? levelNumberText(state.level.id) : difficultyTag(state.difficulty);
    if (this.clean) {
      this.modernTag = tag;
      this.clean.title(state.level ? tag : CAMPAIGN_TEXT.freePlay, state.level ? LEVEL_NAMES[state.level.id]?.name ?? '' : tag);
      this.clean.waves(state.wave, state.endless ? 0 : lastWave(state));
    } else set(this.tag, tag);
    // The build bar carries the permit count. On a cheated portrait run, keep
    // this line for the tax names and the mark that the run cannot earn stars.
    const namesOnly = (this.clean && m.portrait || this.layout === TAXED_PORTRAIT) && state.cheated;
    const siegeRule = this.featLine ? siegeRuleLines(state)[0] ?? CAMPAIGN_TEXT.gateRule : '';
    const taxes = this.featLine ? siegeRule : taxStatusText(state.level?.taxes, namesOnly ? undefined : state.towers.length);
    set(this.taxLine, taxes);
    this.taxLine.setVisible(!!taxes);
    this.taxGlyph?.setVisible(!!taxes);
    if (taxes && !m.portrait && !this.clean) {
      const room = this.tag.x - this.taxLine.x - 4;
      this.taxLine.setScale(Math.min(1, room / this.taxLine.width), 1);
    }
    if (this.clean) {
      this.clean.fitStats([this.gold, this.lives, this.wave]);
      if (this.featLine && state.level) this.fitSiegeRows(state, !!taxes);
      else this.fitTaxRow(!!taxes, state.cheated, state.level?.taxes?.rationing !== undefined);
    } else if (m.portrait) {
      // One row: each stat starts after the one before it; the cheat mark is right-aligned.
      const dx = this.lives.x - this.livesX;
      const used = this.gold.x + this.gold.width + this.lives.width + this.wave.width + this.tag.width;
      const gap = this.layout === TAXED_PORTRAIT
        ? Math.min(m.flowGap, Math.max(0, (PORTRAIT_WIDTH - 4 - used) / 2.5)) : m.flowGap;
      this.livesX = this.gold.x + this.gold.width + gap;
      this.lives.setX(this.livesX + dx);
      this.wave.setX(this.livesX + this.lives.width + gap);
      this.tag.setX(this.wave.x + this.wave.width + gap / 2);
      const rightEdge = state.cheated && this.layout !== TAXED_PORTRAIT ? this.cheatMark.x - this.cheatMark.width - 4 : PORTRAIT_WIDTH;
      this.tag.setVisible(this.tag.x + this.tag.width <= rightEdge);
    } else {
      this.gold.setY(taxes ? MID + WAVE_TAG_SHIFT : state.cheated ? MID - 6 : MID);
      this.lives.setY(taxes ? MID + WAVE_TAG_SHIFT : MID);
      this.cheatMark.setX(taxes ? this.tag.x + this.tag.width + 4 : m.cheat.x);
      this.gold.setScale(Math.min(1, (LIVES_X - m.goldX - 4) / this.gold.width), 1);
      this.wave.setY(tag ? MID + WAVE_TAG_SHIFT : MID);
    }
    // After a loss there is no next wave to play, so the preview goes blank.
    const aimText = m.portrait && special.aiming !== null && special.banner ? stripAimText(special.banner) : null;
    this.drawSiegeCounter(aimText !== null);
    const preview = aimText ?? (state.phase === 'lost' || this.siegeScreens && !this.clean ? '' : this.clean ? this.cleanPreview(state) : previewText(state));
    if (this.next.text !== preview) {
      const siege = !!state.map.otherRoads?.length;
      const previewX = siege && !m.portrait ? 328 : m.preview.x;
      const previewY = siege && m.portrait ? m.preview.y + 2 : m.preview.y;
      const width = m.preview.width + m.preview.x - previewX;
      this.next.setPosition(previewX, previewY);
      if (this.clean) {
        this.next.setText(preview);
      } else if (this.layout === TAXED_PORTRAIT) {
        this.next.setText(preview).setColor(aimText === null ? TEXT.hudDim : TEXT.aimBanner);
      } else if (m.portrait) {
        this.next.setWordWrapWidth(width, true).setText(preview).setColor(aimText === null ? TEXT.hudDim : TEXT.aimBanner);
        const availableHeight = PORTRAIT_STRIP_H - 2 - previewY;
        for (const size of [20, 19, 18, 16, 14]) {
          // At 20 px the actual Caslon glyphs in previews and aim hints occupy
          // 17 px above the baseline and 6 below it. Courier fits inside both.
          // Two 23 px lines exactly fill the space between the stats and frame.
          const ascent = Math.ceil(17 * size / 20);
          const descent = Math.ceil(6 * size / 20);
          this.next.setStyle({ fontSize: size, metrics: { ascent, descent, fontSize: ascent + descent } });
          if (this.next.height <= availableHeight && this.next.width <= width) break;
        }
      } else {
        if (siege) {
          this.next.setWordWrapWidth(width, true).setText(preview);
          for (const size of [14, 13, 12]) {
            this.next.setStyle({ fontSize: size, metrics: { ascent: size - 2, descent: 4, fontSize: size + 2 } });
            if (this.next.height <= BUTTON_H && this.next.width <= width) break;
          }
        } else this.next.setFontSize(previewSize(preview)).setText(preview);
        this.next.setScale(Math.min(1, width / this.next.width), Math.min(1, BUTTON_H / this.next.height));
      }
    }
    if (this.clean) this.fitCleanPreview(state.cheated);
    const call = callEarlyStatus(state);
    let reason: string | null = null;
    if (state.pendingBoon) reason = BOON_PENDING_TEXT;
    else if (!call.ok && call.reason === 'boon-wave') reason = BOON_WAVE_TEXT;
    else if (!call.ok && call.reason === 'last-wave') reason = state.wave < lastWave(state) ? BOSS_WAVE_NEXT_TEXT : LAST_WAVE_TEXT;
    this.startButton.setFontSize(call.ok || reason ? m.callFont : m.startFont);
    if (reason) this.startButton.set(m.portrait ? reason : blockedWaveLabel(!!state.pendingBoon, reason), false);
    else if (call.ok) this.startButton.set(callEarlyLabel(call.bonus, m.portrait), true);
    else if (state.autoWaveTicks !== undefined)
      this.startButton.set(autoWaveText(Math.ceil(state.autoWaveTicks / TICKS_PER_SECOND)), canStartWave(state));
    else this.startButton.set(START_WAVE_TEXT, canStartWave(state));
    if (this.clean) this.startButton.setIcon(call.ok ? 'next' : 'play');
    const label = this.startButton.labelObjects[0];
    // A two-digit call bonus in the fallback face uses all but one pixel at either edge.
    const availableWidth = m.start.width - (this.layout === TAXED_PORTRAIT ? 2 : 4);
    const fitX = Math.min(1, availableWidth / label.width);
    const fitY = Math.min(1, (m.start.height - 2) / label.height);
    if (this.clean) {
      // The dock reserves a separate line for the bonus.
    } else if (this.layout === TAXED_PORTRAIT) label.setScale(Math.min(fitX, fitY));
    else label.setScale(fitX, fitY);
    // Once the game is over the speed toggle is inert (greyed, ignores clicks).
    const playable = state.phase !== 'won' && state.phase !== 'lost';
    const canPause = playable || this.pauseOnResult;
    this.pauseButton.setShown(canPause);
    this.pauseIcon.setVisible(canPause);
    const hideAction = !canPause || this.pauseIcon.scene.time.paused;
    if (this.pauseAction.hidden !== hideAction) this.pauseAction.hidden = hideAction;
    this.speedButton.set(speedLabel(speed), playable);
    const ready = specialReady(state);
    const recharge = specialRecharge(state);
    // Milestone 30 follow-up: while the charge refills the label is the countdown ("Wait 15s").
    this.specialButton.set(recharge ? rechargeText(state.specialRechargeTicks, TICKS_PER_SECOND, m.portrait) : SPECIAL_BUTTON_TEXT, ready);
    if (this.clean) this.specialButton.setIcon(recharge && state.barrelRecharge ? 'clock' : 'bolt');
    if (m.portrait && !this.clean) {
      const specialLabel = this.specialButton.labelObjects[0];
      // On the taxed plaque the label can use the space up to the status dot.
      const reserved = this.layout === TAXED_PORTRAIT ? 4 + 10 + PIP_RADIUS : 24;
      const fit = Math.min(1, (m.special.width - (recharge ? 7 : reserved)) / specialLabel.width);
      specialLabel.setScale(fit, this.layout === TAXED_PORTRAIT ? fit : 1);
    }
    if (this.readyState) {
      const { x, y, width, height } = m.special;
      this.readyState.setVisible(ready && this.readyFit.fit(m.portrait ? 25 : 14,
        [textSlot(this.readyState, { x, y: y + height * .5, width, height: height * .5 })]));
      this.specialButton.setLabelCenter(m.special.height * (ready ? .38 : .5));
    }
    this.specialButton.setPicked(ready && (special.menuOpen || special.aiming !== null));
    // The fill grows in whole pixels, so it redraws at most once per pixel.
    const sb = m.special;
    const fillWidth = recharge ? Math.round(sb.width * recharge.progress) : 0;
    const pulse = !this.clean && ready && nowMs !== undefined ? Math.round(4 * (1 + Math.sin(nowMs / 160))) : 0;
    const key = `${ready}:${recharge ? fillWidth : -1}:${pulse}`;
    if (this.pipKey !== key) {
      this.pipKey = key;
      const cx = sb.x + sb.width - (m.portrait ? 10 : PIP_INSET);
      const cy = sb.y + sb.height / 2;
      this.pip.clear();
      this.rechargeFill.clear();
      if (this.clean) {
        if (ready) this.pip.lineStyle(1.5, CLEAN.mint).strokePoints(roundPoints({
          x: sb.x + 2, y: sb.y + 2, width: sb.width - 4, height: sb.height - 4,
        }, 15), true);
        if (recharge && fillWidth > 8) this.pip.fillStyle(CLEAN.mint, .7)
          .fillRect(sb.x + 4, sb.y + sb.height - 6, Math.min(sb.width - 8, fillWidth - 8), 3);
      } else if (ready) {
        this.pip.fillStyle(COLORS.specialPip, 1).fillCircle(cx, cy, PIP_RADIUS);
        // The pulse: a ring round the pip, growing and fading (play only).
        if (pulse > 0) this.pip.lineStyle(2, COLORS.specialPip, 1 - pulse / 9).strokeCircle(cx, cy, PIP_RADIUS + pulse);
      } else if (recharge) {
        this.rechargeFill.fillStyle(COLORS.rechargeFill, 1).fillRect(sb.x, sb.y, fillWidth, sb.height);
      } else this.pip.lineStyle(1.5, COLORS.specialPipEmpty, 1).strokeCircle(cx, cy, PIP_RADIUS - 0.75);
    }
    this.specialMenu.update(special.menuOpen && ready ? availableSpecials(state) : [], !!state.level?.featherBarrels);
    this.bar.update(state, pick);
    this.bossBar.update(state);
    this.gate?.update(state, special.paused ?? false);
  }

  private fitTaxRow(taxed: boolean, cheated: boolean, rationed: boolean): void {
    const m = this.m;
    const head = m.bands[0];
    const cheatBox = m.portrait ? head : { ...head, x: 636, width: head.x + head.width - 636, y: 64, height: head.y + head.height - 64 };
    const showCheat = cheated && this.cheatFit.fit(parseInt(m.cheat.size), [textSlot(this.cheatMark, cheatBox)]);
    this.cheatMark.setVisible(showCheat);
    if (!taxed) return;
    const right = m.portrait && rationed ? permitSlot(m).x : m.preview.x + m.preview.width;
    const area = { x: m.preview.x, y: head.y, width: right - m.preview.x, height: m.preview.y - head.y + (m.portrait ? textInset(this.taxLine) : 0) };
    this.taxLine.setVisible(this.taxFit.fit(m.portrait ? 25 : 14, [textSlot(this.taxLine, area, true)]));
  }

  private fitSiegeRows(state: GameState, taxed: boolean): void {
    const m = this.m;
    const head = m.bands[0];
    const feat = this.featLine!;
    if (state.level?.feat) {
      const text = cardFeatText(state.level.feat);
      if (feat.text !== text) feat.setText(text);
    }
    const right = head.x + head.width - 15;
    const featRight = m.portrait ? state.cheated ? this.cheatMark.x - this.cheatMark.width - 8 : right : m.preview.x - 4;
    const ruleArea = { ...head, width: (m.portrait ? right : m.mute.x - 10) - head.x,
      height: (m.portrait ? feat.y : m.preview.y) - head.y + textInset(this.taxLine) };
    const featArea = { ...head, width: featRight - head.x };
    this.taxLine.setVisible(taxed && this.taxFit.fit(m.portrait ? 17.25 : 14, [textSlot(this.taxLine, ruleArea, true)]));
    feat.setVisible(!!feat.text && this.featFit.fit(m.portrait ? 20 : 14, [textSlot(feat, featArea, true)]));
    this.cheatMark.setVisible(state.cheated &&
      this.cheatFit.fit(parseInt(m.cheat.size), [textSlot(this.cheatMark, head)]));
  }

  private fitCleanPreview(cheated: boolean): void {
    const m = this.m;
    const { x, y, width } = m.preview;
    const head = m.bands[0];
    const right = !this.featLine && m.portrait && cheated && this.cheatMark.visible
      ? this.cheatMark.x - this.cheatMark.width - 8 : x + width;
    const area = { x: head.x, y: head.y, width: right - head.x,
      height: this.featLine && m.portrait ? this.taxLine.y - head.y + textInset(this.next) : head.height };
    this.next.setPosition(x, y);
    if (m.portrait) {
      const line = Math.max(24, minimumTextSize(this.next)) + 3;
      const spacing = Math.min(this.featLine ? -1 : 0,
        Math.floor(head.y + head.height - y - textInset(this.next) - 2 * line));
      if (this.next.lineSpacing !== spacing) this.next.setLineSpacing(spacing);
    }
    const fits = this.previewFit.fit(m.portrait ? 24 : 14, [textSlot(this.next, area, true)]);
    this.next.setVisible(fits);

  }

  private cleanPreview(state: GameState): string {
    const cached = this.previewMemo;
    if (cached?.wave === state.wave && cached.endless === state.endless &&
        cached.level === state.level && cached.waves === state.fixedWaves) return cached.text;
    const text = previewText(state);
    this.previewMemo = { wave: state.wave, endless: state.endless, level: state.level, waves: state.fixedWaves, text };
    return text;
  }

  get repairRect(): Rect | undefined {
    return this.gate?.repairRect;
  }

  /** The special popup's box while open, else null (milestone 25b). */
  get specialMenuRect(): Rect | null {
    return this.specialMenu.rect;
  }

  strings(): HudStrings {
    return {
      gold: this.clean ? `${HUD_STAT_LABELS[0]} ${this.gold.text}` : this.gold.text,
      lives: this.clean ? `${HUD_STAT_LABELS[1]} ${this.lives.text}` : this.lives.text,
      wave: this.clean ? `${HUD_STAT_LABELS[2]} ${this.wave.text}` : this.wave.text,
      next: this.next.text,
      startWave: this.startButton.text,
      special: this.specialButton.text,
      cheat: this.cheatMark.visible ? CHEAT_MARK : '',
      speed: this.speedButton.text,
      boss: this.bossBar.label(),
      difficulty: this.clean ? this.modernTag : this.tag.text,
    };
  }

  /**
   * `gold` (milestone 30, the cheat's tap area), `startWave`, `speed`, `special` (milestone 25b), `bar:<type>` for each
   * build bar button, and `special:<type>` for each popup button while the
   * popup is open.
   */
  rects(): { startWave: Rect; speed: Rect; special: Rect; gold: Rect; mute: Rect } & Record<string, Rect> {
    return {
      gold: { ...this.m.gold },
      startWave: { ...this.startButton.rect },
      speed: { ...this.speedButton.rect },
      mute: { ...this.muteButton.bounds },
      ...(this.pauseIcon.visible ? { pause: this.pauseButton.rect } : {}),
      special: { ...this.specialButton.rect },
      ...this.bar.rects(),
      ...this.specialMenu.rects(),
      ...this.gate?.rects(),
    };
  }
}
