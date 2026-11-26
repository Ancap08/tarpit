import type Phaser from 'phaser';
import type { HudMetrics } from '../hud';
import { CLEAN_ACTION_H, CLEAN_BUILD_H, CLEAN_DOCK_GAP, CLEAN_SIEGE_PHONE_HEADER, type Layout } from '../layout';
import { HUD_STAT_LABELS } from '../names';
import { CLEAN, glyph, interLoaded, line, motionClock, sans } from './newTheme';
import { DeviceTextFit, textInset, textSlot } from './deviceText';
import { uiBounds } from './devicePixels';

const PHONE_PAD = 15;
const PHONE_CAPTION = 21;
const PHONE_TITLE = 23;
export const PHONE_TOP_CONTROL_CENTER = 27;

export function cleanHudMetrics(layout: Layout, base: HudMetrics, siege = false): HudMetrics {
  const phone = layout.turned;
  const dockY = layout.map.y + layout.map.height;
  const barTop = dockY + (phone ? CLEAN_DOCK_GAP : 23);
  const controlsY = phone ? barTop + CLEAN_BUILD_H + CLEAN_DOCK_GAP : barTop;
  const height = phone ? CLEAN_ACTION_H : 65;
  const headerBottom = siege && phone ? CLEAN_SIEGE_PHONE_HEADER : layout.map.y;
  const head = { x: 8, y: 4, width: layout.width - 16, height: headerBottom - 8 };
  const gutter = phone ? PHONE_PAD : 12;
  const buttons = phone ? CLEAN_ACTION_H : 53;
  const controlsX = head.x + head.width - 2 * buttons - (phone ? PHONE_PAD : 6);
  const previewY = siege ? 83 : layout.map.y - 57;
  const [gold] = phoneColumns(head);
  const phoneControls = (fraction: number) => Math.floor(layout.width * fraction);
  const specialW = phoneControls(.31);
  const speedX = layout.width - CLEAN_ACTION_H - 8;
  return {
    ...base,
    bands: [head, { x: 0, y: dockY, width: layout.width, height: layout.height - dockY }],
    lines: [],
    statY: head.y + (phone ? 63 : 66),
    statSize: phone ? '26px' : '29px',
    goldX: phone ? gold.valueX : head.x + gutter,
    gold: phone ? { x: gold.left, y: head.y + 43, width: gold.width, height: 38 }
      : { x: head.x + 5, y: head.y + 29, width: 121, height: 45 },
    preview: phone ? { x: head.x + gutter, y: previewY, width: head.width - 2 * gutter, originY: 0 }
      : { x: 399, y: head.y + (siege ? 49 : 43), width: siege ? controlsX - 407 : 226, originY: 0 },
    cheat: { x: phone ? head.x + head.width - gutter : 933, y: siege ? phone ? 180 : 96 : phone ? previewY + 13 : head.y + 73,
      size: phone ? '21px' : '14px', originX: 1 },
    mute: { x: controlsX, y: head.y + (phone ? 3 : 6), width: buttons, height: buttons },
    pause: { x: controlsX + buttons, y: head.y + (phone ? 3 : 6), width: buttons, height: buttons },
    special: { x: phone ? 8 : 618, y: controlsY, width: phone ? specialW : 133, height },
    start: { x: phone ? specialW + 13 : 757, y: controlsY, width: phone ? speedX - specialW - 18 : 141, height },
    speed: { x: phone ? speedX : 904, y: controlsY, width: phone ? CLEAN_ACTION_H : 54, height },
    specialFont: phone ? '25px' : '15px',
    startFont: phone ? '25px' : '15px',
    callFont: interLoaded ? (phone ? '25px' : '15px') : phone ? '24px' : '14px',
    menu: { left: phone ? 10 : 618, top: dockY, size: base.menu.size, font: phone ? '25px' : '16px' },
    barTop,
  };
}

function phoneColumns(head: HudMetrics['bands'][number]) {
  const measure = head.width - 2 * PHONE_PAD;
  let left = head.x + PHONE_PAD;
  return [
    { share: .30, offset: 88 },
    { share: .24, offset: 90 },
    { share: .32, offset: 96 },
  ].map(({ share, offset }) => {
    const width = Math.floor(measure * share);
    const column = { left, width, valueX: left + offset };
    left += width;
    return column;
  });
}

/** Right-hand slot of the tax row, shared by the tax line and permit tally. */
export function permitSlot(m: HudMetrics): HudMetrics['bands'][number] {
  const width = 164;
  return { x: m.preview.x + m.preview.width - width, y: m.preview.y - 36, width, height: 40 };
}

export function statColumns(m: HudMetrics): number[] {
  if (m.portrait) return phoneColumns(m.bands[0]).map(column => column.valueX);
  const width = 355;
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
    const nameX = phone ? x + PHONE_PAD : m.goldX;
    this.name = sans(scene, nameX, y + (phone ? 3 + PHONE_TOP_CONTROL_CENTER : 6), '', phone ? PHONE_TITLE : 14, phone ? CLEAN.ink : CLEAN.subdued, true, 'normal')
      .setOrigin(0, phone ? .5 : 0).setWordWrapWidth(phone ? m.mute.x - nameX - 10 : 355).setName('hud-level-name');
    this.pips = scene.add.graphics();
    uiBounds(this.pips, m.bands[0]);
    const small = phone ? PHONE_CAPTION : 14;
    const labelY = phone ? m.statY : y + 29;
    const columns = phoneColumns(m.bands[0]);
    this.captions = statColumns(m).map((valueX, i) => {
      const icon = (['coin', 'heart', 'wave'] as const)[i];
      const color = ([0xffda92, CLEAN.rose, CLEAN.mint] as const)[i];
      const left = phone ? columns[i].left : valueX;
      const shift = phone ? 24 : 16;
      glyph(paint, icon, left + shift * .35, labelY + (phone ? 0 : small / 2 + 1), small * .95, color);
      if (i > 0) {
        const divider = left - (phone ? 10 : 8);
        paint.lineStyle(1, CLEAN.edge).lineBetween(divider, labelY - (phone ? 13 : 0), divider, m.statY + 13);
      }
      return sans(scene, left + shift, labelY, HUD_STAT_LABELS[i], small, CLEAN.subdued)
        .setOrigin(0, phone ? .5 : 0).setName(`hud-stat:${i}`);
    });
    if (phone) line(paint, x + PHONE_PAD, m.statY + 15, width - 2 * PHONE_PAD, CLEAN.edge);
    else paint.lineStyle(1, CLEAN.edge).lineBetween(380, y + 12, 380, y + 77);
  }

  title(level: string, name: string): void {
    const full = name ? `${level} · ${name}` : level;
    if (this.name.text !== full) this.name.setText(full);
    const { m, name: label } = this;
    const head = m.bands[0];
    if (!m.portrait) label.setY(head.y + Math.max(6, textInset(label)));
    const right = m.portrait ? m.mute.x - 8 : 380;
    const height = m.portrait ? m.statY - head.y - 15 : 29;
    const box = { ...head, width: right - head.x, height };
    label.setVisible(this.nameFit.fit(m.portrait ? PHONE_TITLE : 14, [textSlot(label, box, true)]));
  }

  fitStats(values: Phaser.GameObjects.Text[]): void {
    const { m, captions } = this;
    const head = m.bands[0];
    if (m.portrait) {
      const columns = phoneColumns(head);
      const captionSlots = captions.map((label, i) => {
        const { left, valueX } = columns[i];
        return textSlot(label, { x: left, y: m.statY - 23, width: valueX - left + 1, height: 46 });
      });
      const valueSlots = values.map((label, i) => {
        const { left, width, valueX } = columns[i];
        return textSlot(label, { x: valueX - 7, y: m.statY - 20, width: left + width - valueX + 5, height: 40 }, false, m.statY);
      });
      const showCaptions = this.captionFit.fit(PHONE_CAPTION, captionSlots);
      const showValues = this.valueFit.fit(parseInt(m.statSize), valueSlots);
      captions.forEach(label => label.setVisible(showCaptions));
      values.forEach(label => label.setVisible(showValues));
      return;
    }
    const columns = statColumns(m);
    const left = [head.x, columns[1] - 8, columns[2] - 8];
    const right = [...left.slice(1), 380];
    const captionBottom = m.statY - 16;
    const valueBottom = head.y + 88;
    const slots = (labels: Phaser.GameObjects.Text[], y: number, bottom: number, anchor?: number) => labels.map((label, i) =>
      textSlot(label, { x: left[i], y, width: right[i] - left[i], height: bottom - y }, false, anchor));
    const showCaptions = this.captionFit.fit(14, slots(captions, head.y, captionBottom));
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
    label.setY(this.m.statY + (this.m.portrait ? 2 : 5) * (1 - t)).setAlpha(.55 + .45 * t);
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
    const stat = statColumns(this.m)[2];
    const waveColumn = phoneColumns(this.m.bands[0])[2];
    const left = phone ? waveColumn.left + waveColumn.width + 4 : stat;
    const pitch = Math.min(phone ? 17 : 8, ((phone ? x + width - PHONE_PAD : 367) - left) / total);
    for (let i = 0; i < total; i++) {
      const color = i + 1 < current ? 0x64998d : i + 1 === current ? CLEAN.mint : phone ? 0x5c7b72 : 0x365653;
      if (phone && total <= 8) this.pips.fillStyle(color).fillCircle(left + (i + .5) * pitch, this.m.statY, Math.min(4.6, pitch * .34));
      else this.pips.fillStyle(color).fillRect(left + i * pitch, phone ? this.m.statY - 2 : y + 83, pitch - 2, phone ? 4 : 2);
    }
  }
}
