// Tower labels: a short name on a small dark pill under each tower
// ("Musket", "Cannon", "Tar"), with "+" once upgraded. One Text object per
// cell that has held a tower, created on first use and shown or hidden on
// each redraw.

import type Phaser from 'phaser';
import { cellCenter, cellKey, type GameState, type Tower, type TowerType } from '../../sim';
import { FONT, TEXT } from '../palette';

export const LABEL_NAME: Record<TowerType, string> = { musketeer: 'Musket', cannon: 'Cannon', tarpit: 'Tar' };

/** Top of a label, below the tower's centre: clears the 19 px upgrade ring and the Tar Pit blobs. */
export const LABEL_OFFSET_Y = 22;

export function labelText(tower: Pick<Tower, 'type' | 'upgraded'>): string {
  return LABEL_NAME[tower.type] + (tower.upgraded ? '+' : '');
}

export class TowerLabels {
  /** Label per cellKey. */
  private readonly labels = new Map<number, Phaser.GameObjects.Text>();

  constructor(private readonly scene: Phaser.Scene) {}

  private labelFor(tower: Tower): Phaser.GameObjects.Text {
    const key = cellKey(tower.cell);
    let label = this.labels.get(key);
    if (!label) {
      const p = cellCenter(tower.cell);
      label = this.scene.add
        .text(p.x, p.y + LABEL_OFFSET_Y, '', {
          fontFamily: FONT,
          fontSize: '12px',
          fontStyle: 'bold',
          color: TEXT.towerLabel,
          backgroundColor: TEXT.towerLabelBg,
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setVisible(false);
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
      if (label.text !== text) label.setText(text);
      if (!label.visible) label.setVisible(true);
    }
    for (const [key, label] of this.labels) {
      if (!shown.has(key) && label.visible) label.setVisible(false);
    }
  }
}
