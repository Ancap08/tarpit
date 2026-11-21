// Tower labels: a short name (names.ts TOWER_SHORT_LABELS) on a small dark
// pill under each tower, with "+" once upgraded. One Text object per
// cell that has held a tower, created on first use and shown or hidden on
// each redraw. Labels live in a layer made when TowerLabels is constructed,
// so a label created later still draws under the HUD, panel and end screen.
// A tower on the bottom row has its label above it, clear of the HUD, and a
// tower at the left or right edge has its label shifted inside the map.
//
// Crowding (milestone 11, see layoutLabels): a tower with a horizontal
// neighbour, or whose label box meets another's, gets a 10 px label instead
// of 12 px; then, in cell-key order, a label that still meets an earlier
// shown label is hidden. So a row of towers shows every other label.

import type Phaser from 'phaser';
import { cellCenter, cellKey, type GameState, type Tower } from '../../sim';
import { TOWER_SHORT_LABELS } from '../names';
import { FONT, TEXT } from '../palette';

/** Top of a label, below the tower's centre: clears the 19 px upgrade ring and the Tar Pit blobs. */
export const LABEL_OFFSET_Y = 22;
/** Label height in px (12 px text plus 1 px padding top and bottom, rounded up). */
export const LABEL_HEIGHT = 16;
/** Label font sizes: normal, and crowded. */
export const LABEL_SIZE = 12;
export const LABEL_SIZE_SMALL = 10;
/** Horizontal padding each side of the label text, px. */
const LABEL_PAD_X = 3;
/** Labels must end above this y (the HUD top). */
const LABEL_LIMIT_Y = 480;

/** Label centre x for a tower at `cx`: shifted so a `width` px label stays inside the 960 px map. */
export function labelX(cx: number, width: number): number {
  return Math.min(960 - width / 2, Math.max(width / 2, cx));
}

/** True when a label below the tower centred at y `cy` would cross into the HUD, so it goes above. */
export function labelAbove(cy: number): boolean {
  return cy + LABEL_OFFSET_Y + LABEL_HEIGHT > LABEL_LIMIT_Y;
}

export function labelText(tower: Pick<Tower, 'type' | 'upgraded'>): string {
  return TOWER_SHORT_LABELS[tower.type] + (tower.upgraded ? '+' : '');
}

export interface LabelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A label's box at font `size`. Courier New advances 0.6 em per character,
 * so the width is estimated without measuring text (the same in tests and
 * the browser); the height is 1.2 em plus the 1 px padding top and bottom,
 * 16 px at 12 px as LABEL_HEIGHT.
 */
export function labelBox(tower: Pick<Tower, 'type' | 'upgraded' | 'cell'>, size: number): LabelBox {
  const width = labelText(tower).length * 0.6 * size + 2 * LABEL_PAD_X;
  const height = Math.round(size * 1.2) + 2;
  const p = cellCenter(tower.cell);
  const x = labelX(p.x, width) - width / 2;
  const y = labelAbove(p.y) ? p.y - LABEL_OFFSET_Y - height : p.y + LABEL_OFFSET_Y;
  return { x, y, width, height };
}

function meets(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export interface LabelLayout {
  size: number;
  visible: boolean;
}

/**
 * Crowding rule, keyed by cellKey. A tower gets the small size when another
 * tower is horizontally adjacent (same row, columns 1 apart) or their
 * normal-size label boxes meet. Then, in cell-key order, a label is shown
 * unless its box meets a label already shown, so of two clashing labels the
 * higher cell key hides; a hidden label does not hide later ones.
 */
export function layoutLabels(towers: readonly Pick<Tower, 'type' | 'upgraded' | 'cell'>[]): Map<number, LabelLayout> {
  const sorted = [...towers].sort((a, b) => cellKey(a.cell) - cellKey(b.cell));
  const normal = sorted.map((t) => labelBox(t, LABEL_SIZE));
  const sizes = sorted.map((t, i) => {
    const crowded = sorted.some(
      (u, j) =>
        j !== i &&
        ((u.cell.row === t.cell.row && Math.abs(u.cell.col - t.cell.col) === 1) || meets(normal[i], normal[j])),
    );
    return crowded ? LABEL_SIZE_SMALL : LABEL_SIZE;
  });
  const shown: LabelBox[] = [];
  const out = new Map<number, LabelLayout>();
  sorted.forEach((t, i) => {
    const box = labelBox(t, sizes[i]);
    const visible = !shown.some((b) => meets(box, b));
    if (visible) shown.push(box);
    out.set(cellKey(t.cell), { size: sizes[i], visible });
  });
  return out;
}

export class TowerLabels {
  /** Label per cellKey. */
  private readonly labels = new Map<number, Phaser.GameObjects.Text>();
  private readonly layer: Phaser.GameObjects.Layer;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.layer();
  }

  private labelFor(tower: Tower): Phaser.GameObjects.Text {
    const key = cellKey(tower.cell);
    let label = this.labels.get(key);
    if (!label) {
      const p = cellCenter(tower.cell);
      const above = labelAbove(p.y);
      label = this.scene.add
        .text(p.x, above ? p.y - LABEL_OFFSET_Y : p.y + LABEL_OFFSET_Y, '', {
          fontFamily: FONT,
          fontSize: `${LABEL_SIZE}px`,
          fontStyle: 'bold',
          color: TEXT.towerLabel,
          backgroundColor: TEXT.towerLabelBg,
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, above ? 1 : 0)
        .setVisible(false);
      this.layer.add(label);
      this.labels.set(key, label);
    }
    return label;
  }

  update(state: GameState): void {
    const layout = layoutLabels(state.towers);
    const shown = new Set<number>();
    for (const tower of state.towers) {
      const key = cellKey(tower.cell);
      const label = this.labelFor(tower);
      const { size, visible } = layout.get(key) ?? { size: LABEL_SIZE, visible: true };
      const text = labelText(tower);
      const fontSize = `${size}px`;
      if (label.text !== text || label.style.fontSize !== fontSize) {
        label.setText(text);
        label.setFontSize(fontSize);
        label.setX(labelX(cellCenter(tower.cell).x, label.width));
      }
      if (!visible) continue;
      shown.add(key);
      if (!label.visible) label.setVisible(true);
    }
    for (const [key, label] of this.labels) {
      if (!shown.has(key) && label.visible) label.setVisible(false);
    }
  }
}
