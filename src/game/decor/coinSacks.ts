import type Phaser from 'phaser';
import type { Rect } from '../../sim';
import type { PaintedSkin } from '../skin/painted';

const FLIGHT_MS = 720;

interface Sack {
  cost: number;
  size: number;
  at: number;
  lane: number;
  image?: Phaser.GameObjects.Image;
}

/** Each exit sends a purse towards the map edge within the town's strip. */
export class CoinSacks {
  private readonly ink: Phaser.GameObjects.Graphics;
  private readonly active: Sack[] = [];
  private sequence = 0;

  constructor(scene: Phaser.Scene, private readonly layer: Phaser.GameObjects.Container, private readonly painted?: PaintedSkin) {
    this.ink = scene.add.graphics().setName('town:sacks');
    layer.add(this.ink);
  }

  release(cost: number, now: number): void {
    const image = this.painted?.image('sack').setName('town:sacks');
    if (image) this.layer.add(image);
    this.active.push({ cost, size: 10 + 4 * Math.sqrt(cost), lane: this.sequence++ % 3, at: now, image });
  }

  snapshot() {
    return this.active.map(({ cost, size }) => ({ cost, size }));
  }

  draw(box: Rect, turned: boolean, now: number, still: boolean): void {
    if (!this.active.length) return;
    const g = this.ink.clear();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const sack = this.active[i];
      const age = (now - sack.at) / FLIGHT_MS;
      if (age >= 1) {
        sack.image?.destroy();
        this.active.splice(i, 1);
        continue;
      }
      const p = still ? 0.65 : Math.max(0, age);
      const u = turned ? 0.32 + sack.lane * 0.14 + Math.sin(p * Math.PI) * 0.18 : 0.13 + 0.83 * p;
      const v = turned ? 0.34 + 0.62 * p : 0.66 - 0.59 * Math.sin(p * Math.PI) + 0.05 * sack.lane;
      const r = sack.size / 2;
      const x = box.x + r + (box.width - 2 * r) * u;
      const y = box.y + r + (box.height - 2 * r) * v;
      const alpha = Math.min(1, (1 - age) * 5);
      if (sack.image) {
        sack.image.setPosition(x, y).setDisplaySize(sack.size, sack.size).setAlpha(alpha).setRotation(0.5 * p - 0.25);
      } else {
        g.fillStyle(0x55361f, alpha).fillEllipse(x, y + r * 0.19, r * 1.7, r * 1.4);
        g.fillStyle(0xca9547, alpha).fillEllipse(x, y + r * 0.12, r * 1.4, r * 1.18)
          .fillTriangle(x - r * 0.56, y - r * 0.89, x + r * 0.47, y - r * 0.84, x, y - r * 0.17);
        g.lineStyle(1.5, 0x593a26, alpha).lineBetween(x - r * 0.42, y - r * 0.4, x + r * 0.4, y - r * 0.37);
        g.fillStyle(0xffdd73, alpha).fillCircle(x, y + r * 0.15, r * 0.37);
      }
    }
  }
}
