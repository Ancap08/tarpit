// HUD: a dark bar across the bottom 100 px of the 960 x 580 canvas, in two
// rows. Row 1: gold, lives, wave, the next-wave preview, a Start Wave button
// and a 1x/2x speed toggle, buttons at y 484..526. Row 2: the build bar,
// buttons at y 533..575. Buttons are 42 px tall (milestone 14) so they are
// at least 44 px on an iPad in landscape (scale 1024 / 960).

import Phaser from 'phaser';
import { nextWavePreview, WAVES, type GameState, type TowerType } from '../sim';
import type { Rect } from './input';
import { ENEMY_NAMES } from './names';
import { COLORS, FONT, TEXT } from './palette';
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
}

/** "Next: 8 Goblin", "Next: 8 Goblin, 5 Wolf" (names from ENEMY_NAMES), or "Next: none" after the last wave. */
export function previewText(state: GameState): string {
  const groups = nextWavePreview(state);
  if (groups.length === 0) return 'Next: none';
  return `Next: ${groups.map((g) => `${g.count} ${ENEMY_NAMES[g.type]}`).join(', ')}`;
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
  private readonly startButton: Button;
  private readonly speedButton: Button;
  private readonly bar: BuildBar;

  constructor(scene: Phaser.Scene, handlers: HudHandlers) {
    scene.add.rectangle(0, HUD_TOP, 960, HUD_HEIGHT, COLORS.hudBar).setOrigin(0, 0);
    scene.add.rectangle(0, HUD_TOP, 960, 2, COLORS.hudLine).setOrigin(0, 0);

    const stat = (x: number, size = '18px', color: string = TEXT.hud) =>
      scene.add.text(x, MID, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color }).setOrigin(0, 0.5);
    this.gold = stat(14);
    this.lives = stat(126);
    this.wave = stat(238);
    this.next = stat(366, '16px', TEXT.hudDim);

    this.startButton = new Button(scene, { x: 726, y: ROW1_BUTTON_Y, width: 138, height: BUTTON_H }, 'Start Wave', handlers.onStartWave);
    this.speedButton = new Button(scene, { x: 876, y: ROW1_BUTTON_Y, width: 70, height: BUTTON_H }, '1x', handlers.onToggleSpeed);
    this.bar = new BuildBar(scene, ROW2_BUTTON_Y, handlers.onPick);
  }

  update(state: GameState, speed: 1 | 2, pick: TowerType | null): void {
    const set = (t: Phaser.GameObjects.Text, s: string) => {
      if (t.text !== s) t.setText(s);
    };
    set(this.gold, `Gold ${state.gold}`);
    set(this.lives, `Lives ${state.lives}`);
    set(this.wave, `Wave ${state.wave}/${WAVES.length}`);
    // After a loss there is no next wave to play, so the preview goes blank.
    set(this.next, state.phase === 'lost' ? '' : previewText(state));
    this.startButton.set('Start Wave', canStartWave(state));
    // Once the game is over the speed toggle is inert (greyed, ignores clicks).
    this.speedButton.set(`${speed}x`, state.phase !== 'won' && state.phase !== 'lost');
    this.bar.update(state, pick);
  }

  strings(): HudStrings {
    return {
      gold: this.gold.text,
      lives: this.lives.text,
      wave: this.wave.text,
      next: this.next.text,
      startWave: this.startButton.text,
      speed: this.speedButton.text,
    };
  }

  /** `startWave`, `speed` and `bar:<type>` for each build bar button. */
  rects(): { startWave: Rect; speed: Rect } & Record<string, Rect> {
    return { startWave: { ...this.startButton.rect }, speed: { ...this.speedButton.rect }, ...this.bar.rects() };
  }
}
