// HUD: a dark bar across the bottom 60 px with gold, lives, wave, the
// next-wave preview, a Start Wave button and a 1x/2x speed toggle.

import Phaser from 'phaser';
import { nextWavePreview, WAVES, type EnemyType, type GameState } from '../sim';
import { COLORS, FONT, TEXT } from './palette';

export const HUD_TOP = 480;
export const HUD_HEIGHT = 60;
const MID = HUD_TOP + HUD_HEIGHT / 2;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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

class Button {
  readonly rect: Rect;
  private readonly box: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private enabled = true;
  private hover = false;
  private pressed = false;

  constructor(scene: Phaser.Scene, rect: Rect, text: string, onClick: () => void) {
    this.rect = rect;
    this.box = scene.add
      .rectangle(rect.x, rect.y, rect.width, rect.height, COLORS.button)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.buttonEdge);
    this.label = scene.add
      .text(rect.x + rect.width / 2, rect.y + rect.height / 2, text, {
        fontFamily: FONT,
        fontSize: '18px',
        fontStyle: 'bold',
        color: TEXT.button,
      })
      .setOrigin(0.5);
    this.box.setInteractive({ useHandCursor: true });
    this.box.on('pointerover', () => {
      this.hover = true;
      this.refresh();
    });
    this.box.on('pointerout', () => {
      this.hover = false;
      this.pressed = false;
      this.refresh();
    });
    this.box.on('pointerdown', () => {
      this.pressed = true;
      this.refresh();
    });
    this.box.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.refresh();
      if (wasPressed && this.enabled) onClick();
    });
  }

  get text(): string {
    return this.label.text;
  }

  set(text: string, enabled: boolean): void {
    if (this.label.text !== text) this.label.setText(text);
    if (this.enabled !== enabled) {
      this.enabled = enabled;
      this.refresh();
    }
  }

  private refresh(): void {
    let fill: number = COLORS.button;
    if (!this.enabled) fill = COLORS.buttonDisabled;
    else if (this.pressed) fill = COLORS.buttonPressed;
    else if (this.hover) fill = COLORS.buttonHover;
    this.box.setFillStyle(fill);
    this.box.setStrokeStyle(2, this.enabled ? COLORS.buttonEdge : COLORS.buttonEdgeDisabled);
    this.label.setColor(this.enabled ? TEXT.button : TEXT.buttonDisabled);
  }
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
    this.speedButton.set(`${speed}x`, true);
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
