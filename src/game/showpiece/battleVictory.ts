import type Phaser from 'phaser';
import type { Layout } from '../layout';
import { INK_KEY } from './battleArt';

const COLOURS = [0xffd384, 0x9dd9df, 0xff9f93] as const;

export class VictorySalute {
  private readonly sparks: Phaser.GameObjects.Graphics;
  private readonly hats: Phaser.GameObjects.Image[];
  private readonly pole: Phaser.GameObjects.Image;
  private since: number | null = null;
  private lastFrame = -1;

  constructor(scene: Phaser.Scene, private readonly layout: Layout, layer: Phaser.GameObjects.Layer) {
    this.sparks = scene.add.graphics();
    layer.add(this.sparks);
    this.hats = Array.from({ length: 5 }, () => scene.add.image(0, 0, INK_KEY, 'hat').setScale(.5).setVisible(false));
    this.pole = scene.add.image(0, 0, INK_KEY, 'pole').setScale(.65).setVisible(false);
    layer.add([...this.hats, this.pole]);
  }

  draw(won: boolean, now: number, tier: number, calm: boolean): void {
    if (!won) {
      if (this.since !== null) {
        this.sparks.clear();
        this.hats.forEach(h => h.setVisible(false));
        this.pole.setVisible(false);
        this.since = null;
        this.lastFrame = -1;
      }
      return;
    }
    this.since ??= now;
    const elapsed = now - this.since;
    const m = this.layout.map, portrait = this.layout.turned;
    const poleX = m.x + m.width * (portrait ? 0.65 : 0.89);
    const poleY = m.y + m.height * (portrait ? 0.88 : 0.58);
    this.pole.setPosition(poleX, poleY).setVisible(true);
    // The results and their buttons stay immediately available. The salute
    // blooms in the open field around the parchment, then goes quiet.
    const frame = calm ? 0 : Math.min(144, Math.floor(elapsed / 40) + 1);
    if (frame === this.lastFrame) return;
    this.lastFrame = frame;
    const g = this.sparks.clear();
    this.hats.forEach(h => h.setVisible(false));
    if (frame === 0 || frame === 144) return;
    const t = elapsed / 1000;
    for (let b = 0; b < 7; ++b) {
      if (tier === 0 && b % 2) continue;
      const age = t - b * .57;
      if (age < 0 || age > 1.62) continue;
      const x = m.x + m.width * (portrait ? .16 + (b * 17 % 67) / 100 : (b % 2 ? .85 : .14) + (b % 3 - 1) * .038);
      const y = m.y + m.height * (portrait ? .08 + (b % 3) * .033 : .18 + (b % 3) * .085);
      const colour = COLOURS[b % 3];
      if (age < .33) {
        const ascent = (1 - age / .33) * 55;
        g.lineStyle(1.8, colour, .78).lineBetween(x, y + ascent, x - 1, y + ascent + 9);
        continue;
      }
      const u = (age - .33) / 1.29, count = [9, 15, 23][tier];
      for (let i = 0; i < count; i++) {
        const a = 2 * Math.PI * i / count + b * 1.27;
        const r = (1 - (1 - u) * (1 - u)) * (b % 2 ? 42 : 56) * (i % 3 === 0 ? .76 : 1);
        const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
        const px = x + dx, py = y + dy + 20 * u * u;
        g.lineStyle(i % 3 ? 1.4 : 2.1, colour, (1 - u) * .96).lineBetween(px - dx * .14, py - dy * .14 - 2 * u, px, py);
        if (tier === 2 && i % 3 === 1) g.fillStyle(0xfff7dc, 1 - u).fillCircle(px, py, 1.25);
      }
    }
    for (let i = 0; i < this.hats.length; i++) {
      const u = (t - i * .35 - .65) / 1.85;
      if (u < 0 || u > 1 || (tier === 0 && i > 1)) continue;
      const x = m.x + m.width * (portrait ? .19 + i * .14 : (i % 2 ? .88 : .12)) + (i % 2 ? -1 : 1) * u * 15;
      const y = m.y + m.height * (portrait ? .22 : .77) - 4 * u * (1 - u) * (39 + i * 4);
      this.hats[i].setPosition(x, y).setRotation(Math.PI * (i % 2 ? 1 : -1) * (u * 1.35 - .4)).setAlpha(Math.min(1, (1 - u) * 4)).setVisible(true);
    }
  }
}
