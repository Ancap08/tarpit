// Milestone 33 (sound): the mute button, on the title menu and in the HUD.
// A Button with no label and a speaker drawn in code over it: two sound
// waves when the sound is on, a cross when muted (the M key is documented,
// not drawn: a hint that fits the button was too small to read). It follows
// the engine's state, so M or a mute in another scene shows at once.

import type Phaser from 'phaser';
import { sound } from '../audio/engine';
import type { Rect } from '../input';
import { Button } from './button';

/** The speaker's colour: the button text's cream (TEXT.button). */
const ICON = 0xfff4dc;
const CROSS = 0xff8a7a;

export class MuteButton {
  private readonly button: Button;
  private readonly icon: Phaser.GameObjects.Graphics;
  private readonly rect: Rect;

  constructor(scene: Phaser.Scene, rect: Rect) {
    this.rect = { ...rect };
    this.button = new Button(scene, rect, '', () => sound.toggleMute(), { sound: null });
    this.icon = scene.add.graphics();
    const off = sound.onChange(() => this.draw());
    scene.events.once('shutdown', off);
    this.draw();
  }

  get bounds(): Rect {
    return this.button.rect;
  }

  /** The speaker: a box and a cone, then two arcs (on) or a cross (muted). */
  private draw(): void {
    const g = this.icon.clear();
    const r = this.rect;
    const s = Math.min(r.width, r.height) / 42;
    const cx = r.x + r.width / 2 - 5 * s;
    const cy = r.y + r.height / 2;
    g.fillStyle(ICON, 1);
    g.fillRect(cx - 9 * s, cy - 4 * s, 6 * s, 8 * s);
    g.fillTriangle(cx - 4 * s, cy - 4 * s, cx + 4 * s, cy - 10 * s, cx + 4 * s, cy + 10 * s);
    g.fillTriangle(cx - 4 * s, cy - 4 * s, cx + 4 * s, cy + 10 * s, cx - 4 * s, cy + 4 * s);
    if (sound.isMuted) {
      g.lineStyle(3 * s, CROSS, 1);
      g.lineBetween(cx + 8 * s, cy - 6 * s, cx + 18 * s, cy + 6 * s);
      g.lineBetween(cx + 8 * s, cy + 6 * s, cx + 18 * s, cy - 6 * s);
    } else {
      g.lineStyle(2.5 * s, ICON, 1);
      for (const radius of [8, 14]) {
        g.beginPath();
        g.arc(cx + 2 * s, cy, radius * s, -Math.PI / 4, Math.PI / 4);
        g.strokePath();
      }
    }
  }
}
