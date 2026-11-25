import type Phaser from 'phaser';
import type { HudMetrics } from '../hud';
import type { Layout } from '../layout';
import { CLEAN, glyph, line, motionClock, sans } from './newTheme';

export function cleanHudMetrics(layout: Layout, base: HudMetrics): HudMetrics {
  const phone = layout.turned;
  const barTop = phone ? layout.map.y + layout.map.height + 3 : 503;
  const controlsY = phone ? barTop + 95 : barTop;
  const height = phone ? 91 : 65;
  return {
    ...base,
    bands: phone
      ? [{ x: 5, y: 4, width: 550, height: 205 }, { x: 0, y: barTop - 3, width: 560, height: layout.height - barTop + 3 }]
      : [{ x: 14, y: 13, width: 352, height: 148 }, { x: 0, y: 480, width: 960, height: 100 }],
    lines: [],
    statY: phone ? 108 : 78,
    statSize: phone ? '25px' : '16px',
    goldX: phone ? 43 : 44,
    gold: phone ? { x: 14, y: 99, width: 160, height: 91 } : { x: 22, y: 58, width: 102, height: 45 },
    preview: phone ? { x: 23, y: 155, width: 514, originY: 0 } : { x: 26, y: 111, width: 328, originY: 0 },
    cheat: { x: phone ? 536 : 354, y: phone ? 140 : 148, size: phone ? '24px' : '12px', originX: 1 },
    mute: phone ? { x: 371, y: 8, width: 91, height: 91 } : { x: 260, y: 16, width: 46, height: 46 },
    pause: phone ? { x: 464, y: 8, width: 91, height: 91 } : { x: 312, y: 16, width: 48, height: 46 },
    special: { x: phone ? 5 : 618, y: controlsY, width: phone ? 176 : 133, height },
    start: { x: phone ? 186 : 757, y: controlsY, width: phone ? 275 : 141, height },
    speed: { x: phone ? 466 : 904, y: controlsY, width: phone ? 91 : 44, height },
    specialFont: phone ? '25px' : '15px',
    startFont: phone ? '25px' : '15px',
    callFont: phone ? '24px' : '14px',
    menu: { left: phone ? 10 : 618, top: phone ? barTop : 480, size: base.menu.size, font: phone ? '25px' : '16px' },
    barTop,
  };
}

export class CleanReadouts {
  private readonly name: Phaser.GameObjects.Text;
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly clock?: () => number;
  private readonly rolls = new Map<Phaser.GameObjects.Text, number>();
  private pipKey = '';

  constructor(scene: Phaser.Scene, private readonly m: HudMetrics, paint: Phaser.GameObjects.Graphics) {
    this.clock = motionClock(scene);
    const phone = m.portrait;
    this.name = sans(scene, phone ? 24 : 26, phone ? 12 : 17, '', phone ? 24 : 13, CLEAN.subdued)
      .setWordWrapWidth(phone ? 345 : 225).setName('hud-level-name');
    this.pips = scene.add.graphics();
    const x = phone ? 23 : 26;
    const width = phone ? 514 : 328;
    line(paint, x, phone ? 90 : 60, phone ? 345 : 225, CLEAN.edge);
    line(paint, x, phone ? 123 : 94, width, CLEAN.edge);
    const y = m.statY;
    const size = phone ? 24 : 17;
    glyph(paint, 'coin', m.goldX - (phone ? 19 : 14), y, size, 0xffda92);
    glyph(paint, 'heart', phone ? 173 : 134, y, size, CLEAN.rose);
    glyph(paint, 'wave', phone ? 303 : 240, y, size, CLEAN.mint);
  }

  title(level: string, name: string): void {
    const full = name ? `${level} · ${name}` : level;
    if (this.name.text !== full) this.name.setText(full);
  }

  count(label: Phaser.GameObjects.Text, value: string): void {
    const now = this.clock?.();
    if (label.text !== value) {
      if (now !== undefined && label.text) this.rolls.set(label, now);
      label.setText(value);
    }
    const started = this.rolls.get(label);
    if (started === undefined || now === undefined) return;
    const t = Math.min(1, (now - started) / 145);
    label.setY(this.m.statY + 5 * (1 - t)).setAlpha(.55 + .45 * t);
    if (t === 1) this.rolls.delete(label);
  }

  waves(current: number, total: number): void {
    const key = `${current}/${total}`;
    if (key === this.pipKey) return;
    this.pipKey = key;
    this.pips.clear();
    if (!total) return;
    const phone = this.m.portrait;
    const pitch = phone ? Math.min(13, 200 / total) : Math.min(9, 115 / total);
    const width = pitch - 2;
    const x = this.m.bands[0].x + this.m.bands[0].width - 15 - total * pitch;
    for (let i = 0; i < total; i++) {
      const color = i + 1 < current ? 0x578e81 : i + 1 === current ? CLEAN.mint : CLEAN.raised;
      this.pips.fillStyle(color).fillRect(x + i * pitch, phone ? 205 : 150, width, 3);
    }
  }
}
