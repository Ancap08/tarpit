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

import Phaser from 'phaser';
import { callEarlyStatus, nextWavePreview, unlockedSpecials, WAVES, type Difficulty, type GameState, type SpecialType, type TowerType } from '../sim';
import type { Rect } from './input';
import { BOSS_NAME, callEarlyLabel, DIFFICULTY_LABELS, ENEMY_NAMES, SPECIAL_BUTTON_TEXT, START_WAVE_TEXT } from './names';
import { COLORS, FONT, TEXT } from './palette';
import { BossBar } from './ui/bossBar';
import { BuildBar } from './ui/buildBar';
import { Button } from './ui/button';
import { SpecialMenu } from './ui/specialMenu';

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
export const WAVE_TAG_SHIFT = -7;
export const TAG_OFFSET = 11;
export const TAG_SIZE = 12;

/**
 * "Next: 8 Goblin", "Next: 8 Goblin, 5 Wolf" (names from ENEMY_NAMES), or
 * "Next: none" after the last wave. A wave with the boss lists its other
 * groups, then " + Grumblefoot" (BOSS_NAME), with no count.
 */
export function previewText(state: GameState): string {
  const groups = nextWavePreview(state);
  if (groups.length === 0) return 'Next: none';
  const plain = groups.filter((g) => g.type !== 'boss');
  const boss = plain.length < groups.length ? ` + ${BOSS_NAME}` : '';
  return `Next: ${plain.map((g) => `${g.count} ${ENEMY_NAMES[g.type]}`).join(', ')}${boss}`;
}

/** Row 1 buttons (milestone 25b): Special, Start Wave and the speed toggle, 8 px apart, 14 px from the right edge. */
export const SPECIAL_BUTTON = { x: 630, width: 100 } as const;
export const START_BUTTON = { x: 738, width: 130 } as const;
export const SPEED_BUTTON = { x: 876, width: 70 } as const;
/** The Special button's charge pip: radius, and its centre's distance from the button's right edge. */
export const PIP_RADIUS = 5;
export const PIP_INSET = 14;

/**
 * The preview's room: from x 356 (10 px after "Wave 10/10" at 18 px ends)
 * to 10 px before the Special button at x 630 (milestone 25b; it was x 366
 * to 716 before the button).
 */
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
export function previewLines(text: string, size: number): number {
  const perLine = Math.floor(PREVIEW_WIDTH / (0.6 * size));
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

/** Start Wave does something only in setup with waves left. */
export function canStartWave(state: GameState): boolean {
  return state.phase === 'setup' && state.wave < WAVES.length;
}

/** Start Wave's label size: 18 px, or 14 px while it reads the call-early label (milestone 25c). */
export const START_LABEL_SIZE = '18px';
export const CALL_LABEL_SIZE = '14px';

/** Call early (milestone 25c): whether the next wave can be called now, and the bonus it would pay. */
export function callEarlyInfo(state: GameState): { available: boolean; bonus: number } {
  const status = callEarlyStatus(state);
  return status.ok ? { available: true, bonus: status.bonus } : { available: false, bonus: 0 };
}

/** A special can be used now: a wave is running and its charge is unspent (milestone 25b). */
export function specialReady(state: GameState): boolean {
  return state.phase === 'wave' && state.specialCharges > 0;
}

/** What GameScene shows of the specials (milestone 25b): the popup and the special being aimed. */
export interface HudSpecial {
  menuOpen: boolean;
  aiming: SpecialType | null;
}

export interface HudHandlers {
  /** Start Wave was pressed: starts the wave in setup, or calls the next one early (milestone 25c). */
  onStartWave: () => void;
  onToggleSpeed: () => void;
  /** A build bar button was clicked (only when pickable). */
  onPick: (type: TowerType) => void;
  /** The Special button was pressed (only while specialReady). */
  onSpecial: () => void;
  /** A special was picked in the popup. */
  onSpecialPick: (type: SpecialType) => void;
}

export class Hud {
  private readonly gold: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly specialButton: Button;
  private readonly pip: Phaser.GameObjects.Graphics;
  private readonly specialMenu: SpecialMenu;
  private pipLit: boolean | null = null;
  private readonly bar: BuildBar;
  private readonly bossBar: BossBar;

  constructor(scene: Phaser.Scene, handlers: HudHandlers) {
    scene.add.rectangle(0, HUD_TOP, 960, HUD_HEIGHT, COLORS.hudBar).setOrigin(0, 0);
    scene.add.rectangle(0, HUD_TOP, 960, 2, COLORS.hudLine).setOrigin(0, 0);

    const stat = (x: number, size = '18px', color: string = TEXT.hud) =>
      scene.add.text(x, MID, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color }).setOrigin(0, 0.5);
    this.gold = stat(14);
    this.lives = stat(126);
    this.wave = stat(238);
    this.tag = stat(238, `${TAG_SIZE}px`, TEXT.hudDim).setY(MID + TAG_OFFSET);
    this.next = stat(PREVIEW_X, `${PREVIEW_SIZE}px`, TEXT.hudDim).setWordWrapWidth(PREVIEW_WIDTH, true);

    // The Special label is left-aligned (an empty right label) so the pip fits on its right.
    this.specialButton = new Button(scene, { ...SPECIAL_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H }, SPECIAL_BUTTON_TEXT, handlers.onSpecial, {
      fontSize: '16px',
      right: '',
    });
    this.pip = scene.add.graphics();
    this.startButton = new Button(scene, { ...START_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H }, START_WAVE_TEXT, handlers.onStartWave);
    this.speedButton = new Button(scene, { ...SPEED_BUTTON, y: ROW1_BUTTON_Y, height: BUTTON_H }, '1x', handlers.onToggleSpeed);
    this.specialMenu = new SpecialMenu(scene, SPECIAL_BUTTON.x, HUD_TOP, handlers.onSpecialPick);
    this.bar = new BuildBar(scene, ROW2_BUTTON_Y, handlers.onPick);
    this.bossBar = new BossBar(scene);
  }

  update(state: GameState, speed: 1 | 2, pick: TowerType | null, special: HudSpecial = { menuOpen: false, aiming: null }): void {
    const set = (t: Phaser.GameObjects.Text, s: string) => {
      if (t.text !== s) t.setText(s);
    };
    set(this.gold, `Gold ${state.gold}`);
    // The sim lets lives go below 0 (the boss's exit costs 5); the HUD shows 0.
    set(this.lives, `Lives ${Math.max(0, state.lives)}`);
    set(this.wave, `Wave ${state.wave}/${WAVES.length}`);
    const tag = difficultyTag(state.difficulty);
    set(this.tag, tag);
    this.wave.setY(tag ? MID + WAVE_TAG_SHIFT : MID);
    // After a loss there is no next wave to play, so the preview goes blank.
    const preview = state.phase === 'lost' ? '' : previewText(state);
    if (this.next.text !== preview) this.next.setFontSize(previewSize(preview)).setText(preview);
    const call = callEarlyInfo(state);
    this.startButton.setFontSize(call.available ? CALL_LABEL_SIZE : START_LABEL_SIZE);
    if (call.available) this.startButton.set(callEarlyLabel(call.bonus), true);
    else this.startButton.set(START_WAVE_TEXT, canStartWave(state));
    // Once the game is over the speed toggle is inert (greyed, ignores clicks).
    this.speedButton.set(`${speed}x`, state.phase !== 'won' && state.phase !== 'lost');
    const ready = specialReady(state);
    this.specialButton.set(SPECIAL_BUTTON_TEXT, ready);
    this.specialButton.setPicked(ready && (special.menuOpen || special.aiming !== null));
    if (this.pipLit !== ready) {
      this.pipLit = ready;
      const cx = SPECIAL_BUTTON.x + SPECIAL_BUTTON.width - PIP_INSET;
      this.pip.clear();
      if (ready) this.pip.fillStyle(COLORS.specialPip, 1).fillCircle(cx, MID, PIP_RADIUS);
      else this.pip.lineStyle(1.5, COLORS.specialPipEmpty, 1).strokeCircle(cx, MID, PIP_RADIUS - 0.75);
    }
    this.specialMenu.update(special.menuOpen && ready ? unlockedSpecials(state.wave) : []);
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
      speed: this.speedButton.text,
      boss: this.bossBar.label(),
      difficulty: this.tag.text,
    };
  }

  /**
   * `startWave`, `speed`, `special` (milestone 25b), `bar:<type>` for each
   * build bar button, and `special:<type>` for each popup button while the
   * popup is open.
   */
  rects(): { startWave: Rect; speed: Rect; special: Rect } & Record<string, Rect> {
    return {
      startWave: { ...this.startButton.rect },
      speed: { ...this.speedButton.rect },
      special: { ...this.specialButton.rect },
      ...this.bar.rects(),
      ...this.specialMenu.rects(),
    };
  }
}
