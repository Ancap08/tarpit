import type Phaser from 'phaser';
import type { Point } from '../../sim';
import type { Layout } from '../layout';
import { HUD_FONT } from '../palette';

/** The icon and number are one world-space sign next to the sill. */
export class RentHeldBadge {
  private readonly badge: Phaser.GameObjects.Container;
  private readonly number: Phaser.GameObjects.Text;
  private shown = 0;

  constructor(scene: Phaser.Scene, layout: Layout, sill: Point) {
    const p = layout.toScreen(sill);
    const g = scene.add.graphics();
    g.fillStyle(0x222e2a).fillRoundedRect(-31, -15, 62, 30, 7);
    g.lineStyle(1.5, 0xc6d5a9).strokeRoundedRect(-30, -14, 60, 28, 6);
    g.fillStyle(0xd7dfc7).fillCircle(-21, -4, 3).fillCircle(-13, -6, 3.5)
      .fillCircle(-6, -4, 3).fillRoundedRect(-24, 1, 21, 6, 3);
    this.number = scene.add.text(12, 0, '', {
      fontFamily: HUD_FONT, fontSize: '23px', fontStyle: 'bold', color: '#fff3d1',
      metrics: { ascent: 18, descent: 5, fontSize: 23 },
    }).setOrigin(.5).setName('rent-held-count');
    const side = layout.turned ? 1 : -1;
    this.badge = scene.add.container(p.x + side * 99, p.y + 27, [g, this.number]).setVisible(false);
  }

  update(count: number): void {
    if (count === this.shown) return;
    this.shown = count;
    this.badge.setVisible(count > 0);
    if (count) this.number.setText(String(count));
  }
}
