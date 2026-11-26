import type Phaser from 'phaser';
import type { Rect } from '../input';
import { interLoaded, textMetrics } from './newTheme';

type Text = Phaser.GameObjects.Text;
type Slot = { label: Text; width: number; height: number; wrap?: boolean; alongside?: Text };

export const DEVICE_TEXT_MIN_CSS = 11.1;
export const DEVICE_TEXT_GUTTER_CSS = 2;

export function textInset(label: Text): number {
  return DEVICE_TEXT_GUTTER_CSS * Math.max(label.scene.scale.displayScale.x, label.scene.scale.displayScale.y);
}

export function minimumTextSize(label: Text): number {
  const { x, y } = label.scene.scale.displayScale;
  return Math.ceil(100 * DEVICE_TEXT_MIN_CSS * Math.max(x, y)) / 100;
}

/** The largest box around the label's anchor that stays inside the panel. */
export function textSlot(label: Text, box: Rect, wrap = false, y = label.y): Slot {
  const { x, originX, originY } = label;
  const extent = (a: number, b: number, origin: number) => a < -1e-8 || b < -1e-8 ? 0
    : Math.min(origin ? a / origin : Infinity, origin < 1 ? b / (1 - origin) : Infinity);
  const pad = textInset(label);
  return { label, wrap,
    width: extent(x - box.x - pad, box.x + box.width - pad - x, originX),
    height: extent(y - box.y - pad, box.y + box.height - pad - y, originY),
  };
}

export function placeFloatingText(label: Text, box: Rect, x: number, y: number): void {
  const pad = textInset(label);
  const clamp = (value: number, start: number, end: number) => Math.max(start, Math.min(value, end));
  label.setPosition(
    clamp(x, box.x + pad + label.width * label.originX, box.x + box.width - pad - label.width * (1 - label.originX)),
    clamp(y, box.y + pad + label.height * label.originY, box.y + box.height - pad - label.height * (1 - label.originY)),
  );
}

/** Keep Inter at the designed size. Fit device-font peers together down to the floor. */
export class DeviceTextFit {
  private previous?: { preferred: number; floor: number; slots: Slot[]; text: string[]; wrapWidth: number[]; fits: boolean };

  fit(preferred: number, slots: Slot[]): boolean {
    if (slots.length === 0) return true;
    const floor = minimumTextSize(slots[0].label);
    const prev = this.previous;
    if (prev && prev.preferred === preferred && prev.floor === floor && prev.slots.length === slots.length && slots.every(
      ({ label, width, height, wrap, alongside }, i) => label === prev.slots[i].label && width === prev.slots[i].width &&
        height === prev.slots[i].height && wrap === prev.slots[i].wrap && label.text === prev.text[i] &&
        alongside === prev.slots[i].alongside &&
        (label.style.wordWrapWidth ?? 0) === prev.wrapWidth[i],
    )) return prev.fits;

    const target = Math.max(floor, preferred);
    const smallest = interLoaded ? target : floor;
    let fits = false;
    for (let size = target; ; size = Math.max(smallest, size - 1)) {
      for (const { label, width, wrap } of slots) {
        if (parseFloat(String(label.style.fontSize)) !== size) label.setStyle({ fontSize: size, metrics: textMetrics(size) });
        if (wrap && label.style.wordWrapWidth !== Math.max(1, width)) {
          label.setWordWrapWidth(Math.max(1, width), label.style.wordWrapUseAdvanced);
        }
      }
      fits = slots.every(({ label, width, height, alongside }) => !label.text ||
        label.width + (alongside?.text ? alongside.width : 0) <= width && label.height <= height);
      if (fits || size === smallest) break;
    }
    this.previous = { preferred, floor, slots, text: slots.map(s => s.label.text),
      wrapWidth: slots.map(s => s.label.style.wordWrapWidth ?? 0), fits };
    return fits;
  }
}
