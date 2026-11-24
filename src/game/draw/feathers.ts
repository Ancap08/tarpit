import type Phaser from 'phaser';
import type { Point } from '../../sim';
import type { Facing } from '../anim/sheets';

type Graphics = Phaser.GameObjects.Graphics;
type Layer = Phaser.GameObjects.Layer;
const PLUMAGE = 'feather-plumage';
const LOOSE = 'feather-loose';
const vane = [
  { x: 0, y: 0 }, { x: -4, y: -3 }, { x: -6, y: -9 }, { x: -3, y: -8 },
  { x: -6, y: -13 }, { x: -5, y: -19 }, { x: -1, y: -25 }, { x: 4, y: -22 },
  { x: 7, y: -16 }, { x: 6, y: -12 }, { x: 3, y: -10 }, { x: 5, y: -10 },
  { x: 4, y: -5 },
];

function quill(g: Graphics, x: number, y: number, angle: number, size: number, alpha = 1): void {
  g.save().translateCanvas(x, y).rotateCanvas(angle).scaleCanvas(size, size);
  g.fillStyle(0xfffbed, alpha).fillPoints(vane, true);
  g.lineStyle(1.65, 0x493b39, alpha).strokePoints(vane, true);
  g.lineStyle(1.5, 0x9f8055, alpha).lineBetween(-0.5, 2, 0.5, -18);
  g.restore();
}

/** Bake the attached pair and the loose quill once, then batch them as images. */
export function makePlumage(scene: Phaser.Scene, layer: Layer, size: number): Phaser.GameObjects.Image {
  if (!scene.textures.exists(PLUMAGE)) {
    const g = scene.make.graphics({}, false);
    g.save().translateCanvas(64, 64).scaleCanvas(2, 2);
    quill(g, 3, 1, 1.35, 0.79);
    quill(g, 2, 0, 0.52, 1);
    g.restore().generateTexture(PLUMAGE, 128, 128);
    g.clear();
    quill(g, 16, 28, 0, 1);
    g.generateTexture(LOOSE, 32, 32);
    g.destroy();
  }
  const mark = scene.add.image(0, 0, PLUMAGE).setScale(size / 2);
  layer.add(mark);
  return mark;
}

const PUFF_MS = 520;

/** A fan of quills opens wider than a troll, then settles and fades. */
export class FeatherPuffs {
  private bursts: (Point & { start: number })[] = [];

  add(at: Point, time: number): void {
    this.bursts.push({ ...at, start: time });
  }

  draw(g: Graphics, now: number): void {
    if (!this.bursts.length) return;
    this.bursts = this.bursts.filter(p => now - p.start < PUFF_MS);
    for (const p of this.bursts) {
      const t = (now - p.start) / PUFF_MS;
      const span = 13 + 31 * (1 - (1 - t) ** 2);
      for (let i = 0; i < 5; i++) {
        const angle = (i - 2) * 0.75;
        quill(g, p.x + Math.sin(angle) * span, p.y - Math.cos(angle) * span + 23 * t * t,
          angle + t * (i % 2 ? 1 : -1), 0.7, Math.min(1, 2 * (1 - t)));
      }
    }
  }
}

const SHED_MS = 150;
const TRAIL_COUNT = 3;
const WAKE = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] } as const;

/** Each quill stays at its own shedding point, even when the runner turns a corner. */
export class FeatherTrail {
  readonly pieces;
  private next = 0;
  private due = 0;

  constructor(scene: Phaser.Scene, layer: Layer) {
    this.pieces = Array.from({ length: TRAIL_COUNT }, (_, i) => {
      const image = scene.add.image(0, 0, LOOSE).setScale(0.43 + i * 0.04).setVisible(false);
      layer.add(image);
      return { image, x: 0, y: 0, dx: 0, start: 0, spin: 0 };
    });
  }

  draw(x: number, y: number, facing: Facing, now: number): void {
    if (now >= this.due) {
      const f = this.pieces[this.next];
      const [dx, dy] = WAKE[facing];
      f.spin = this.next % 2 ? -1 : 1;
      f.start = now;
      f.x = x + dx * 11 + f.spin * 4;
      f.y = y + dy * 11;
      f.dx = dx * 8 + f.spin * 6;
      f.image.setVisible(true);
      this.next = (this.next + 1) % TRAIL_COUNT;
      this.due = now + SHED_MS;
    }
    for (const f of this.pieces) {
      if (!f.image.visible) continue;
      const t = (now - f.start) / (SHED_MS * TRAIL_COUNT);
      if (t >= 1) {
        f.image.setVisible(false);
        continue;
      }
      f.image.setPosition(f.x + f.dx * t + f.spin * 3 * Math.sin(t * Math.PI * 2), f.y - 6 * t + 21 * t * t)
        .setRotation(f.spin * (0.7 + 2.4 * t)).setAlpha(Math.min(1, 2 * (1 - t)));
    }
  }

  clear(): void {
    for (const f of this.pieces) f.image.setVisible(false);
    this.next = 0;
    this.due = 0;
  }
}
