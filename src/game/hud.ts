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

import Phaser from 'phaser';
import { nextWavePreview, WAVES, type Difficulty, type GameState, type TowerType } from '../sim';
import type { Rect } from './input';
import { BOSS_NAME, DIFFICULTY_LABELS, ENEMY_NAMES } from './names';
import { COLORS, FONT, TEXT } from './palette';
import { BossBar } from './ui/bossBar';
import { BuildBar } from './ui/buildBar';
import { Button } from './ui/button';

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

/** The preview's room: from x 366 to 10 px before the Start Wave button at x 726. */
export const PREVIEW_X = 366;
export const PREVIEW_WIDTH = 350;
export const PREVIEW_SIZE = 16;
export const PREVIEW_SIZE_LONG = 13;

/**
 * The preview's font size: 16 px when the text fits PREVIEW_WIDTH on one
 * line, else 13 px wrapped to two lines (milestone 23; the wave 10 preview
 * with "+ Grumblefoot" is 61 characters, and the longer milestone 22
 * previews already ran under the Start Wave button). Courier New advances
 * 0.6 em per character, so this needs no text measuring.
 */
export function previewSize(text: string): number {
  return text.length * 0.6 * PREVIEW_SIZE <= PREVIEW_WIDTH ? PREVIEW_SIZE : PREVIEW_SIZE_LONG;
}

/** Start Wave does something only in setup with waves left. */
export function canStartWave(state: GameState): boolean {
  return state.phase === 'setup' && state.wave < WAVES.length;
}

export interface HudHandlers {
  onStartWave: () => void;
  onToggleSpeed: () => void;
  /** A build bar button was clicked (only when pickable). */
  onPick: (type: TowerType) => void;
}

export class Hud {
  private readonly gold: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;
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

    this.startButton = new Button(scene, { x: 726, y: ROW1_BUTTON_Y, width: 138, height: BUTTON_H }, 'Start Wave', handlers.onStartWave);
    this.speedButton = new Button(scene, { x: 876, y: ROW1_BUTTON_Y, width: 70, height: BUTTON_H }, '1x', handlers.onToggleSpeed);
    this.bar = new BuildBar(scene, ROW2_BUTTON_Y, handlers.onPick);
    this.bossBar = new BossBar(scene);
  }

  update(state: GameState, speed: 1 | 2, pick: TowerType | null): void {
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
    this.startButton.set('Start Wave', canStartWave(state));
    // Once the game is over the speed toggle is inert (greyed, ignores clicks).
    this.speedButton.set(`${speed}x`, state.phase !== 'won' && state.phase !== 'lost');
    this.bar.update(state, pick);
    this.bossBar.update(state);
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

  /** `startWave`, `speed` and `bar:<type>` for each build bar button. */
  rects(): { startWave: Rect; speed: Rect } & Record<string, Rect> {
    return { startWave: { ...this.startButton.rect }, speed: { ...this.speedButton.rect }, ...this.bar.rects() };
  }
}
