// HUD: a dark bar across the bottom 60 px with gold, lives, wave, the
// next-wave preview, a Start Wave button and a 1x/2x speed toggle.

import Phaser from 'phaser';
import { nextWavePreview, WAVES, type EnemyType, type GameState } from '../sim';
import type { Rect } from './input';
import { COLORS, FONT, TEXT } from './palette';
import { Button } from './ui/button';

export type { Rect };

export const HUD_TOP = 480;
export const HUD_HEIGHT = 60;
const MID = HUD_TOP + HUD_HEIGHT / 2;

export interface HudStrings {
  gold: string;
  lives: string;
  wave: string;
  next: string;
  startWave: string;
  speed: string;
}

const TYPE_NAME: Record<EnemyType, string> = { goblin: 'Goblin', wolf: 'Wolf', troll: 'Troll' };

/** "Next: 8 Goblin", "Next: 8 Goblin, 5 Wolf", or "Next: none" after the last wave. */
export function previewText(state: GameState): string {
  const groups = nextWavePreview(state);
  if (groups.length === 0) return 'Next: none';
  return `Next: ${groups.map((g) => `${g.count} ${TYPE_NAME[g.type]}`).join(', ')}`;
}

/** Start Wave does something only in setup with waves left. */
export function canStartWave(state: GameState): boolean {
  return state.phase === 'setup' && state.wave < WAVES.length;
}

export interface HudHandlers {
  onStartWave: () => void;
  onToggleSpeed: () => void;
}

export class Hud {
  private readonly gold: Phaser.GameObjects.Text;
  private readonly lives: Phaser.GameObjects.Text;
  private readonly wave: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly startButton: Button;
  private readonly speedButton: Button;

  constructor(scene: Phaser.Scene, handlers: HudHandlers) {
    scene.add.rectangle(0, HUD_TOP, 960, HUD_HEIGHT, COLORS.hudBar).setOrigin(0, 0);
    scene.add.rectangle(0, HUD_TOP, 960, 2, COLORS.hudLine).setOrigin(0, 0);

    const stat = (x: number, size = '18px', color: string = TEXT.hud) =>
      scene.add.text(x, MID, '', { fontFamily: FONT, fontSize: size, fontStyle: 'bold', color }).setOrigin(0, 0.5);
    this.gold = stat(14);
    this.lives = stat(126);
    this.wave = stat(238);
    this.next = stat(366, '16px', TEXT.hudDim);

    this.startButton = new Button(scene, { x: 726, y: HUD_TOP + 12, width: 138, height: 36 }, 'Start Wave', handlers.onStartWave);
    this.speedButton = new Button(scene, { x: 876, y: HUD_TOP + 12, width: 70, height: 36 }, '1x', handlers.onToggleSpeed);
  }

  update(state: GameState, speed: 1 | 2): void {
    const set = (t: Phaser.GameObjects.Text, s: string) => {
      if (t.text !== s) t.setText(s);
    };
    set(this.gold, `Gold ${state.gold}`);
    set(this.lives, `Lives ${state.lives}`);
    set(this.wave, `Wave ${state.wave}/${WAVES.length}`);
    set(this.next, previewText(state));
    this.startButton.set('Start Wave', canStartWave(state));
    // Once the game is over the speed toggle is inert (greyed, ignores clicks).
    this.speedButton.set(`${speed}x`, state.phase !== 'won' && state.phase !== 'lost');
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

  rects(): { startWave: Rect; speed: Rect } {
    return { startWave: { ...this.startButton.rect }, speed: { ...this.speedButton.rect } };
  }
}
