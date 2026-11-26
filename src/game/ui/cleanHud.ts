import type Phaser from 'phaser';
import type { HudMetrics } from '../hud';
import type { Layout } from '../layout';
import { HUD_STAT_LABELS } from '../names';
import { CLEAN, glyph, interLoaded, line, motionClock, sans } from './newTheme';
import { DeviceTextFit, textInset, textSlot } from './deviceText';

export function cleanHudMetrics(layout: Layout, base: HudMetrics): HudMetrics {
  const phone = layout.turned;
  const dockY = layout.map.y + layout.map.height;
  const barTop = dockY + (phone ? 3 : 23);
  const controlsY = phone ? barTop + 98 : barTop;
  const height = phone ? 94 : 65;
  const head = phone ? { x: 12, y: 4, width: layout.width - 24, height: layout.map.y - 7 }
    : { x: 8, y: 4, width: layout.width - 16, height: layout.map.y - 8 };
  const gutter = phone ? 19 : 12;
  const buttons = phone ? 94 : 53;
  const controlsX = head.x + head.width - 2 * buttons - 6;
  const phoneControls = (fraction: number) => Math.floor(layout.width * fraction);
  const specialW = phoneControls(.31);
  const speedX = layout.width - 99;
  return {
    ...base,
    bands: [head, { x: 0, y: dockY, width: layout.width, height: layout.height - dockY }],
    lines: [],
    statY: head.y + (phone ? 110 : 66),
    statSize: phone ? (interLoaded ? '38px' : '40px') : '29px',
    goldX: head.x + gutter,
    gold: { x: head.x + 5, y: head.y + (phone ? 58 : 29), width: phone ? head.width * .24 : 121, height: phone ? 78 : 45 },
    preview: phone ? { x: head.x + gutter, y: head.y + 168, width: head.width - 2 * gutter, originY: 0 }
      : { x: 399, y: head.y + 43, width: 226, originY: 0 },
    cheat: { x: phone ? head.x + head.width - gutter : 933, y: head.y + (phone ? 153 : 73), size: phone ? '24px' : '14px', originX: 1 },
    mute: { x: controlsX, y: head.y + (phone ? 3 : 6), width: buttons, height: buttons },
    pause: { x: controlsX + buttons, y: head.y + (phone ? 3 : 6), width: buttons, height: buttons },
    special: { x: phone ? 5 : 618, y: controlsY, width: phone ? specialW : 133, height },
    start: { x: phone ? specialW + 11 : 757, y: controlsY, width: phone ? speedX - specialW - 16 : 141, height },
    speed: { x: phone ? speedX : 904, y: controlsY, width: phone ? 94 : 54, height },
    specialFont: phone ? '25px' : '15px',
    startFont: phone ? '25px' : '15px',
    callFont: interLoaded ? (phone ? '25px' : '15px') : phone ? '24px' : '14px',
    menu: { left: phone ? 10 : 618, top: dockY, size: base.menu.size, font: phone ? '25px' : '16px' },
    barTop,
  };
}

export function statColumns(m: HudMetrics): number[] {
  const width = m.portrait ? Math.min(m.bands[0].width, 505) : 355;
  return [m.goldX, m.goldX + Math.floor(width * .30), m.goldX + Math.floor(width * .60)];
}

export class CleanReadouts {
  private readonly name: Phaser.GameObjects.Text;
  private readonly captions: Phaser.GameObjects.Text[];
  private readonly nameFit = new DeviceTextFit();
  private readonly captionFit = new DeviceTextFit();
  private readonly valueFit = new DeviceTextFit();
  private readonly pips: Phaser.GameObjects.Graphics;
  private readonly clock?: () => number;
  private readonly rolls = new Map<Phaser.GameObjects.Text, number>();
  private current = -1;
  private total = -1;

  constructor(scene: Phaser.Scene, private readonly m: HudMetrics, paint: Phaser.GameObjects.Graphics) {
    this.clock = motionClock(scene);
    const phone = m.portrait;
    const { y, x, width } = m.bands[0];
    this.name = sans(scene, m.goldX, y + (phone ? 4 : 6), '', phone ? 25 : 14, CLEAN.subdued, true, 'normal')
      .setWordWrapWidth(phone ? m.mute.x - m.goldX - 10 : 355).setName('hud-level-name');
    this.pips = scene.add.graphics();
    const small = phone ? 24 : 14;
    const labelY = y + (phone ? 58 : 29);
    this.captions = statColumns(m).map((left, i) => {
      const icon = (['coin', 'heart', 'wave'] as const)[i];
      const color = ([0xffda92, CLEAN.rose, CLEAN.mint] as const)[i];
      const shift = phone ? 28 : 16;
      glyph(paint, icon, left + shift * .32, labelY + small / 2 + 1, small * .95, color);
      if (i > 0) {
        const divider = left - (phone ? 12 : 8);
        paint.lineStyle(1, CLEAN.edge).lineBetween(divider, labelY, divider, m.statY + (phone ? 17 : 13));
      }
      return sans(scene, left + shift, labelY, HUD_STAT_LABELS[i], small, CLEAN.subdued).setName(`hud-stat:${i}`);
    });
    if (phone) line(paint, m.goldX, y + 137, x + width - m.goldX - 19, CLEAN.edge);
    else paint.lineStyle(1, CLEAN.edge).lineBetween(380, y + 12, 380, y + 77);
  }

  title(level: string, name: string): void {
    const full = name ? `${level} · ${name}` : level;
    if (this.name.text !== full) this.name.setText(full);
    const { m, name: label } = this;
    const head = m.bands[0];
    label.setY(head.y + Math.max(m.portrait ? 4 : 6, textInset(label)));
    const right = m.portrait ? m.mute.x - 8 : 380;
    const box = { ...head, width: right - head.x, height: m.portrait ? 58 : 29 };
    label.setVisible(this.nameFit.fit(m.portrait ? 25 : 14, [textSlot(label, box, true)]));
  }

  fitStats(values: Phaser.GameObjects.Text[]): void {
    const { m, captions } = this;
    const head = m.bands[0];
    const columns = statColumns(m);
    const left = [head.x, columns[1] - (m.portrait ? 12 : 8), columns[2] - (m.portrait ? 12 : 8)];
    const right = [...left.slice(1), m.portrait ? head.x + head.width : 380];
    const captionBottom = m.statY - (m.portrait ? 19 : 16);
    const valueBottom = head.y + (m.portrait ? 137 : 88);
    const slots = (labels: Phaser.GameObjects.Text[], y: number, bottom: number, anchor?: number) => labels.map((label, i) =>
      textSlot(label, { x: left[i], y, width: right[i] - left[i], height: bottom - y }, false, anchor));
    const showCaptions = this.captionFit.fit(m.portrait ? 24 : 14, slots(captions, head.y, captionBottom));
    const showValues = this.valueFit.fit(parseInt(m.statSize), slots(values, captionBottom - 9, valueBottom, m.statY));
    for (const label of captions) label.setVisible(showCaptions);
    for (const label of values) {
      label.setVisible(showValues);
      label.setY(Math.min(label.y, valueBottom - textInset(label) - label.height / 2));
    }
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
    if (current === this.current && total === this.total) return;
    this.current = current;
    this.total = total;
    this.pips.clear();
    if (!total) return;
    const { x, y, width } = this.m.bands[0];
    const phone = this.m.portrait;
    const pitch = Math.min(phone ? 16 : 8, ((phone ? x + width - 15 : 367) - statColumns(this.m)[2]) / total);
    const left = phone && total <= 8 ? x + width - 18 - pitch * total : statColumns(this.m)[2];
    for (let i = 0; i < total; i++) {
      const color = i + 1 < current ? 0x64998d : i + 1 === current ? CLEAN.mint : 0x365653;
      if (phone && total <= 8) this.pips.fillStyle(color).fillCircle(left + i * pitch + 4, y + 119, 3.6);
      else this.pips.fillStyle(color).fillRect(left + i * pitch, y + (phone ? 132 : 83), pitch - 2, phone ? 3 : 2);
    }
  }
}
