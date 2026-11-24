import type Phaser from 'phaser';
import type { Layout } from '../layout';

const COLOURS = [0xffd384, 0x9dd9df, 0xff9f93] as const;

export class VictorySalute {
  private readonly sparks: Phaser.GameObjects.Graphics;
  private since: number | null = null;
  private lastFrame = -1;

  constructor(scene: Phaser.Scene, private readonly layout: Layout, layer: Phaser.GameObjects.Layer) {
    this.sparks = scene.add.graphics();
    layer.add(this.sparks);
  }

  draw(won: boolean, now: number, tier: number, calm: boolean): void {
    if (!won) {
      if (this.since !== null) {
        this.sparks.clear();
        this.since = null;
        this.lastFrame = -1;
      }
      return;
    }
    this.since ??= now;
    const elapsed = now - this.since;
    const m = this.layout.map, portrait = this.layout.turned;
    // The townsfolk toss their hats at the exit while fireworks light the
    // open sky around the result. The flag and crowd belong to the town.
    const frame = calm ? 0 : Math.min(144, Math.floor(elapsed / 40) + 1);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const g = this.sparks.clear();
    if (frame === 0 || frame === 144) return;
    const t = elapsed / 1000;
    for (let b = 0; b < 7; ++b) {
      if (tier === 0 && b % 2) continue;
      const age = t - b * .57;
      if (age < 0 || age > 1.62) continue;
      // Landscape leaves a 105 px margin on either side of the result.
      // Keep the right launches in the sky above the town and its hats.
      const x = portrait ? m.x + m.width * (.16 + (b * 17 % 67) / 100)
        : m.x + (b % 2 ? m.width - 53 : 53);
      const y = m.y + (portrait ? m.height * (.08 + (b % 3) * .033) : 35 + (b % 3) * 9);
      const colour = COLOURS[b % 3];
      if (age < .33) {
        const ascent = (1 - age / .33) * 55;
        g.lineStyle(1.8, colour, .78).lineBetween(x, y + ascent, x - 1, y + ascent + 9);
        continue;
      }
      const u = (age - .33) / 1.29, count = [9, 15, 23][tier];
      for (let i = 0; i < count; i++) {
        const a = 2 * Math.PI * i / count + b * 1.27;
        const radius = portrait ? (b % 2 ? 42 : 56) : 40;
        const r = (1 - (1 - u) * (1 - u)) * radius * (i % 3 === 0 ? .76 : 1);
        const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        const px = x + dx, py = y + dy + 20 * u * u;
        g.lineStyle(i % 3 ? 1.4 : 2.1, colour, (1 - u) * .96).lineBetween(px - dx * .14, py - dy * .14 - 2 * u, px, py);
        if (tier === 2 && i % 3 === 1) g.fillStyle(0xfff7dc, 1 - u).fillCircle(px, py, 1.25);
      }
    }
  }
}
