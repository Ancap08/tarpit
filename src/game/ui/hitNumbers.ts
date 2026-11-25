import type Phaser from 'phaser';
import type { Point } from '../../sim';
import { PANEL_TEXT } from '../names';
import { CLEAN, glyph, motionClock, sans } from './newTheme';

const LIMIT = 14;
const LIFE_MS = 470;

export class HitNumbers {
  private readonly flashes: Phaser.GameObjects.Graphics;
  private readonly labels: { text: Phaser.GameObjects.Text; point: Point; at: number }[] = [];
  private readonly motion: boolean;

  constructor(private readonly scene: Phaser.Scene, private readonly now: () => number, private readonly phone: boolean) {
    this.flashes = scene.add.graphics().setName('clean-hit-numbers');
    this.motion = !!motionClock(scene);
  }

  hit(point: Point, damage: number): void {
    const at = this.now();
    let mark = this.labels.find(entry => !entry.text.visible);
    if (!mark && this.labels.length < LIMIT) {
      const text = sans(this.scene, 0, 0, '', this.phone ? 23 : 14, CLEAN.gold, true).setOrigin(0, .5)
        .setStroke('#162626', 5);
      mark = { text, point, at };
      this.labels.push(mark);
    }
    mark ??= this.labels.reduce((a, b) => a.at < b.at ? a : b);
    mark.point = point;
    mark.at = at;
    mark.text.setText(PANEL_TEXT.damage(damage)).setVisible(true);
  }

  draw(): void {
    if (this.labels.length === 0) return;
    const now = this.now();
    const g = this.flashes.clear();
    for (const mark of this.labels) {
      if (!mark.text.visible) continue;
      const elapsed = now - mark.at;
      const t = elapsed / (this.motion ? LIFE_MS : 160);
      if (t >= 1) {
        mark.text.setVisible(false);
        continue;
      }
      const x = mark.point.x, y = mark.point.y - 23;
      mark.text.setPosition(x + 13, y - (this.motion ? 25 * t : 0)).setAlpha(Math.min(1, 2 * (1 - t)));
      if (elapsed < 105) glyph(g, 'sparkle', x, y, this.phone ? 28 : 19, 0xffeabc, this.motion ? 1 - elapsed / 105 : 1);
    }
  }
}
