// Tower labels: a short name on a small dark pill under each tower
// ("Musket", "Cannon", "Tar"), with "+" once upgraded. One Text object per
// build spot, created once and shown or hidden on each redraw.

import type Phaser from 'phaser';
import { MAP, towerAt, type GameState, type Tower, type TowerType } from '../../sim';
import { FONT, TEXT } from '../palette';

export const LABEL_NAME: Record<TowerType, string> = { musketeer: 'Musket', cannon: 'Cannon', tarpit: 'Tar' };

/** Top of a label, below the tower's centre: clears the 19 px upgrade ring and the Tar Pit blobs. */
export const LABEL_OFFSET_Y = 22;

export function labelText(tower: Pick<Tower, 'type' | 'upgraded'>): string {
  return LABEL_NAME[tower.type] + (tower.upgraded ? '+' : '');
}

export class TowerLabels {
  private readonly labels: Phaser.GameObjects.Text[];

  constructor(scene: Phaser.Scene) {
    this.labels = MAP.buildSpots.map((s) =>
      scene.add
        .text(s.x, s.y + LABEL_OFFSET_Y, '', {
          fontFamily: FONT,
          fontSize: '12px',
          fontStyle: 'bold',
          color: TEXT.towerLabel,
          backgroundColor: TEXT.towerLabelBg,
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 0)
        .setVisible(false),
    );
  }

  update(state: GameState): void {
    this.labels.forEach((label, spotId) => {
      const tower = towerAt(state, spotId);
      if (!tower) {
        if (label.visible) label.setVisible(false);
        return;
      }
      const text = labelText(tower);
      if (label.text !== text) label.setText(text);
      if (!label.visible) label.setVisible(true);
    });
  }
}
