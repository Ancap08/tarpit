import type Phaser from 'phaser';
import type { Rect } from '../input';
import { textMetrics } from './newTheme';

type Text = Phaser.GameObjects.Text;
const PAPER_INSET = 5; // Canvas units inside the painted edge.
const PAPER_CLEARANCE_CSS = 6;
const PAPER_TEXT_FLOOR_CSS = 12;

export function paperPadding(scene: Phaser.Scene) {
  const { x, y } = scene.scale.displayScale;
  return { x: PAPER_INSET + PAPER_CLEARANCE_CSS * x, y: PAPER_INSET + PAPER_CLEARANCE_CSS * y };
}

/** Space remaining after the inset and CSS clearance, in canvas units. */
export function paperLabelRoom(label: Text, rect: Rect) {
  const pad = paperPadding(label.scene);
  const bounds = label.getBounds();
  return {
    x: Math.min(bounds.left - rect.x, rect.x + rect.width - bounds.right) - pad.x,
    y: Math.min(bounds.top - rect.y, rect.y + rect.height - bounds.bottom) - pad.y,
  };
}

export function fitPaperText(labels: Text[], preferred: number, fits: () => boolean): void {
  const floor = Math.ceil(100 * PAPER_TEXT_FLOOR_CSS * labels[0].scene.scale.displayScale.y) / 100;
  for (let size = Math.max(preferred, floor); ; size = Math.max(floor, size - 1)) {
    for (const label of labels) {
      if (parseFloat(String(label.style.fontSize)) !== size) label.setStyle({ fontSize: size, metrics: textMetrics(size) });
    }
    if (fits() || size === floor) return;
  }
}
