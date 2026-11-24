import type Phaser from 'phaser';
import type { Point } from '../../sim';

type Graphics = Phaser.GameObjects.Graphics;
const vane = [
  { x: 0, y: 0 }, { x: -3, y: -3 }, { x: -4, y: -8 }, { x: -1, y: -7 },
  { x: -3, y: -10 }, { x: 1, y: -15 }, { x: 4, y: -10 }, { x: 3, y: -5 },
  { x: 1, y: -2 },
];

function quill(g: Graphics, x: number, y: number, angle: number, size: number, alpha = 1): void {
  g.save().translateCanvas(x, y).rotateCanvas(angle).scaleCanvas(size, size);
  g.fillStyle(0xfff4cf, alpha).fillPoints(vane, true);
  g.lineStyle(1.4, 0x423a34, alpha).strokePoints(vane, true);
  g.lineStyle(1, 0x947c62, alpha).lineBetween(0, 2, 1, -11);
  g.restore();
}

/** Inked flight feathers stay attached to the sprite as it turns. */
export function drawPlumage(g: Graphics, side: number, scale: number): void {
  quill(g, side * 3, 1, side * 0.86, scale);
  quill(g, side * 2, 3, side * 1.3, scale * 0.75);
}

/** A brief outward spray stays where the enemy was struck. */
export class FeatherPuffs {
  private bursts: (Point & { start: number })[] = [];

  add(at: Point, time: number): void {
    this.bursts.push({ ...at, start: time });
  }

  draw(g: Graphics, now: number): void {
    if (!this.bursts.length) return;
    this.bursts = this.bursts.filter(p => now - p.start < 380);
    for (const p of this.bursts) {
      const t = (now - p.start) / 380;
      for (let i = 0; i < 4; i++) {
        const angle = (i - 1.5) * 0.88;
        const span = 5 + 25 * (1 - (1 - t) ** 2);
        quill(g, p.x + Math.sin(angle) * span, p.y - Math.cos(angle) * span + 14 * t * t,
          angle + t * (i % 2 ? 1 : -1), 0.55, 1 - t);
      }
    }
  }
}
