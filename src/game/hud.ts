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
import type { PaintedSkin } from './skin/painted';
import {
  BOON_PENDING_TEXT,
  BOON_WAVE_TEXT,
  BOSS_WAVE_NEXT_TEXT,
  LAST_WAVE_TEXT,
  autoWaveText,
  taxStatusText,
  callEarlyLabel,
  levelNumberText,
  blockedWaveLabel,
  CHEAT_MARK,
  DIFFICULTY_LABELS,
  ENEMY_SHORT_NAMES,
  rechargeText,
  PAUSE_TEXT,
  SPECIAL_BUTTON_TEXT,
  speedLabel,
  START_WAVE_TEXT,
  waveCounterText,
} from './names';
import { COLORS, FONT, HUD_FONT, TEXT } from './palette';
import { BossBar } from './ui/bossBar';
import { BuildBar } from './ui/buildBar';
import { Button } from './ui/button';
import { PORTRAIT_STACK, portraitRow2, STACK_SIZE, stripAimText, type StackSize } from './ui/geometry';
import {
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
  menuOpen: boolean;
  aiming: SpecialType | null;
  /** 32b follow-up: the aim banner's words while aiming; portrait shows them in the strip. */
  banner?: { main: string; hint: string } | null;
}


export interface HudHandlers {
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
  private readonly pauseAction: HTMLButtonElement;
  private readonly pauseIcon: Phaser.GameObjects.Graphics;
  private readonly pauseButton: Button;
  private readonly muteButton: MuteButton;
  private readonly m: HudMetrics;
  /** The Lives readout's left edge now (portrait: after the gold), for the exit shake. */
  private livesX = LIVES_X;

  constructor(scene: Phaser.Scene, handlers: HudHandlers, private readonly layout: Layout = LANDSCAPE, painted?: PaintedSkin, private readonly pauseOnResult = false) {
    const m = { ...hudMetrics(layout) };
    this.m = m;
    const counter = scene.add.graphics();
    for (const band of m.bands) {
      panel(counter, band, THEME.wood);
      // Fine horizontal grain follows the counter, clear of the printed labels.
      for (const offset of [3, 5, band.height - 5]) {
        counter.lineStyle(1, THEME.brass, 0.22)
          .lineBetween(band.x + 5, band.y + offset, band.x + band.width - 5, band.y + offset);
      }
    }
    for (const l of m.lines) scene.add.rectangle(l.x, l.y, l.width, l.height, COLORS.hudLine).setOrigin(0, 0);

    const stat = (x: number, size = m.statSize, color: string = TEXT.hud) =>
      scene.add.text(x, m.statY, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color }).setOrigin(0, 0.5);
    const fixedStat = (x: number, size: number, color: string) => {
      const descent = Math.ceil(size / 5);
      const height = size + descent;
      return scene.add.text(x, m.statY, '', {
        fontFamily: HUD_FONT, fontSize: size, fontStyle: 'bold', color, fixedHeight: height,
        metrics: { ascent: size, descent, fontSize: height },
      }).setOrigin(0, 0.5);
    };
    const statSize = Number.parseInt(m.statSize, 10);
    if (!m.portrait) coin(counter, 13, m.statY, 5);
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

    // The Special label is left-aligned (an empty right label) so the pip fits on its right.
    this.specialButton = new Button(scene, m.special, SPECIAL_BUTTON_TEXT, handlers.onSpecial, {
      fontSize: m.specialFont,
      labelInset: m.portrait ? 4 : undefined,
      right: '',
    });
    // The recharge fill sits over the button's box and under its label.
    this.rechargeFill = scene.add.graphics();
    scene.children.moveBelow(this.rechargeFill, this.specialButton.labelObjects[0]);
    this.pip = scene.add.graphics();
    this.cheatMark = scene.add
      .text(m.cheat.x, m.cheat.y, CHEAT_MARK, { fontFamily: FONT, fontSize: m.cheat.size, fontStyle: 'bold', color: TEXT.cheatMark })
      .setOrigin(m.cheat.originX, 0.5)
      .setVisible(false);
    if (layout === TAXED_PORTRAIT) {
      this.cheatMark.setStyle({ metrics: { ascent: statSize, descent: 4, fontSize: statSize + 4 } });
      this.next.setStyle({ metrics: { ascent: 18, descent: 6, fontSize: 24 } });
    }
    // Milestone 33: Start Wave's own sound is the horn (or Call next's), so its click plays no tap.
    this.startButton = new Button(scene, m.start, START_WAVE_TEXT, handlers.onStartWave, m.portrait ? { fontSize: m.startFont, sound: null } : { sound: null });
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
    this.speedButton = new Button(scene, m.speed, '1x', handlers.onToggleSpeed, { onPress: handlers.onSpeedPress, fontSize: m.portrait ? m.startFont : undefined });
    this.specialMenu = new SpecialMenu(scene, m.menu.left, m.menu.top, handlers.onSpecialPick, layout.map.y, m.menu.size, m.menu.font);
    this.bar = new BuildBar(scene, m.barTop, handlers.onPick, layout, painted);
    this.bossBar = new BossBar(scene, layout);
    this.muteButton = new MuteButton(scene, m.mute);
    this.pauseButton = new Button(scene, m.pause, m.portrait ? '' : PAUSE_TEXT.button, handlers.onPause, {
      fontSize: '18px', labelY: 57, sound: null,
    });
    this.pauseIcon = scene.add.graphics().fillStyle(COLORS.buttonEdgePicked);
    const iconHeight = m.portrait ? 26 : 21;
    for (const x of [-11, 4]) this.pauseIcon.fillRect(x, 0, 7, iconHeight);
    // Put the native accessibility target over the plaque. Phaser handles pointer input.
    this.pauseAction = document.createElement('button');
    this.pauseAction.textContent = PAUSE_TEXT.button;
    this.pauseAction.onclick = handlers.onPause;
    this.pauseAction.className = 'pause-action';
    scene.game.canvas.after(this.pauseAction);
    const fitControls = () => {
      const { canvasBounds: b, displayScale: s } = scene.scale;
      if (m.portrait) {
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
        m.pause.y + (m.portrait ? (m.pause.height - iconHeight) / 2 : 16));
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

  /**
   * Milestone 31 (play only): an enemy got through. `flash` > 0 shows the
   * Lives number in red; `dx` shakes it sideways by that many px.
   */
  livesFx(flash: number, dx: number): void {
    this.lives.setColor(flash > 0 ? TEXT.livesFlash : TEXT.hud).setX(this.livesX + dx);
  }

  /** `nowMs`: the clock in play, for the ready pip's pulse; left out in test mode (no pulse). */
  update(state: GameState, speed: 1 | 2 | 3, pick: TowerType | null, special: HudSpecial = { menuOpen: false, aiming: null }, nowMs?: number): void {
    const m = this.m;
    const set = (t: Phaser.GameObjects.Text, s: string) => {
      if (t.text !== s) t.setText(s);
    };
    set(this.gold, `Gold ${state.gold}`);
    this.cheatMark.setVisible(state.cheated);
    // The sim lets lives go below 0 (the boss's exit costs 5); the HUD shows 0.
    set(this.lives, `Lives ${Math.max(0, state.lives)}`);
    set(this.wave, waveCounterText(state.wave, state.endless, lastWave(state)));
    const tag = state.level ? levelNumberText(state.level.id) : difficultyTag(state.difficulty);
    set(this.tag, tag);
    // The build bar carries the permit count. On a cheated portrait run, keep
    // this line for the tax names and the mark that the run cannot earn stars.
    const namesOnly = this.layout === TAXED_PORTRAIT && state.cheated;
    const taxes = taxStatusText(state.level?.taxes, namesOnly ? undefined : state.towers.length);
    set(this.taxLine, taxes);
    this.taxLine.setVisible(!!taxes);
    if (taxes && !m.portrait) {
      const room = this.tag.x - this.taxLine.x - 4;
      this.taxLine.setScale(Math.min(1, room / this.taxLine.width), 1);
    }
    if (m.portrait) {
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
    const preview = aimText ?? (state.phase === 'lost' ? '' : previewText(state));
    if (this.next.text !== preview) {
      const width = m.preview.width;
      if (this.layout === TAXED_PORTRAIT) {
        this.next.setText(preview).setColor(aimText === null ? TEXT.hudDim : TEXT.aimBanner);
      } else if (m.portrait) {
        this.next.setWordWrapWidth(width, true).setText(preview).setColor(aimText === null ? TEXT.hudDim : TEXT.aimBanner);
        const availableHeight = PORTRAIT_STRIP_H - 2 - m.preview.y;
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
        this.next.setFontSize(previewSize(preview)).setText(preview);
        this.next.setScale(Math.min(1, width / this.next.width), Math.min(1, BUTTON_H / this.next.height));
      }
    }
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
    const label = this.startButton.labelObjects[0];
    // A two-digit call bonus in the fallback face uses all but one pixel at either edge.
    const availableWidth = m.start.width - (this.layout === TAXED_PORTRAIT ? 2 : 4);
    const fitX = Math.min(1, availableWidth / label.width);
    const fitY = Math.min(1, (m.start.height - 2) / label.height);
    if (this.layout === TAXED_PORTRAIT) label.setScale(Math.min(fitX, fitY));
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
    if (m.portrait) {
      const specialLabel = this.specialButton.labelObjects[0];
      // On the taxed plaque the label can use the space up to the status dot.
      const reserved = this.layout === TAXED_PORTRAIT ? 4 + 10 + PIP_RADIUS : 24;
      const fit = Math.min(1, (m.special.width - (recharge ? 7 : reserved)) / specialLabel.width);
      specialLabel.setScale(fit, this.layout === TAXED_PORTRAIT ? fit : 1);
    }
    this.specialButton.setPicked(ready && (special.menuOpen || special.aiming !== null));
    // The fill grows in whole pixels, so it redraws at most once per pixel.
    const sb = m.special;
    const fillWidth = recharge ? Math.round(sb.width * recharge.progress) : 0;
    const pulse = ready && nowMs !== undefined ? Math.round(4 * (1 + Math.sin(nowMs / 160))) : 0;
    const key = `${ready}:${recharge ? fillWidth : -1}:${pulse}`;
    if (this.pipKey !== key) {
      this.pipKey = key;
      const cx = sb.x + sb.width - (m.portrait ? 10 : PIP_INSET);
      const cy = sb.y + sb.height / 2;
      this.pip.clear();
      this.rechargeFill.clear();
      if (ready) {
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
  }

  /** The special popup's box while open, else null (milestone 25b). */
  get specialMenuRect(): Rect | null {
    return this.specialMenu.rect;
  }

  strings(): HudStrings {
    return {
      gold: this.gold.text,
      lives: this.lives.text,
      wave: this.wave.text,
      next: this.next.text,
      startWave: this.startButton.text,
      special: this.specialButton.text,
      cheat: this.cheatMark.visible ? CHEAT_MARK : '',
      speed: this.speedButton.text,
      boss: this.bossBar.label(),
      difficulty: this.tag.text,
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
    };
  }
}
