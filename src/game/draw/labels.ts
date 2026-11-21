// Tower labels: a short name on a small dark pill under each tower
// ("Musket", "Cannon", "Tar"), with "+" once upgraded. One Text object per
// cell that has held a tower, created on first use and shown or hidden on
// each redraw. Labels live in a layer made when TowerLabels is constructed,
// so a label created later still draws under the HUD, panel and end screen.
// A tower on the bottom row has its label above it, clear of the HUD, and a
// tower at the left or right edge has its label shifted inside the map.

import type Phaser from 'phaser';
import { cellCenter, cellKey, type GameState, type Tower, type TowerType } from '../../sim';
import { FONT, TEXT } from '../palette';

// Longbow, Mortar and Fire Pot labels are milestone 11 placeholders; that
// milestone settles label size and crowding.
export const LABEL_NAME: Record<TowerType, string> = {
  musketeer: 'Musket',
  cannon: 'Cannon',
  tarpit: 'Tar',
  longbow: 'Longbow',
  mortar: 'Mortar',
  firepot: 'Fire',
};

/** Top of a label, below the tower's centre: clears the 19 px upgrade ring and the Tar Pit blobs. */
export const LABEL_OFFSET_Y = 22;
/** Label height in px (12 px text plus 1 px padding top and bottom, rounded up). */
export const LABEL_HEIGHT = 16;
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
  return LABEL_NAME[tower.type] + (tower.upgraded ? '+' : '');
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
          fontSize: '12px',
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
    const shown = new Set<number>();
    for (const tower of state.towers) {
      const label = this.labelFor(tower);
      shown.add(cellKey(tower.cell));
      const text = labelText(tower);
      if (label.text !== text) {
        label.setText(text);
        label.setX(labelX(cellCenter(tower.cell).x, label.width));
      }
      if (!label.visible) label.setVisible(true);
    }
    for (const [key, label] of this.labels) {
      if (!shown.has(key) && label.visible) label.setVisible(false);
    }
  }
}
