import type Phaser from 'phaser';
import type { Rect } from '../input';
import { COLORS } from '../palette';

/** World-space cell, also captured by the touch magnifier. */
export function drawPlacementCell(g: Phaser.GameObjects.Graphics, r: Rect, valid: boolean, painted: boolean): void {
  const { x, y, width, height } = r;
  if (!painted) {
    const color = valid ? COLORS.cellOk : COLORS.cellBad;
    g.fillStyle(color, 0.25);
    g.fillRect(x, y, width, height);
    g.lineStyle(2, color, 1);
    g.strokeRect(x + 1, y + 1, width - 2, height - 2);
    return;
  }

  const accent = valid ? COLORS.paintedCellLight : COLORS.paintedCellBlocked;
  g.fillStyle(accent, 0.35);
  g.fillRect(x, y, width, height);
  // A charcoal rim against the ground and a light rail just inside it.
  g.lineStyle(2, COLORS.paintedCellEdge, 1);
  g.strokeRect(x + 1, y + 1, width - 2, height - 2);
  g.lineStyle(2, accent, 1);
  g.strokeRect(x + 3, y + 3, width - 6, height - 6);
  if (!valid) {
    const inset = 7;
    const left = x + inset, right = x + width - inset;
    const top = y + inset, bottom = y + height - inset;
    g.lineStyle(4, COLORS.paintedCellEdge, 1);
    g.lineBetween(left, top, right, bottom);
    g.lineBetween(left, bottom, right, top);
  }
}
