import type Phaser from 'phaser';

export const STAR_ROW = 'campaignStars';

/** Three slots, with a four-pointed spark for a feat when shown on the road map. */
export function drawStarRow(scene: Phaser.Scene, x: number, y: number, earned: number, size: number, cssColor: string, feat = false) {
  const row = scene.add.container(x, y).setName(STAR_ROW);
  const color = parseInt(cssColor.slice(1), 16);
  const radius = size / 2 - 1;
  for (let slot = 0; slot < 3; slot++) {
    const spark = feat && slot === 2;
    const star = scene.add.star((slot - 1) * (size + 2), 0, spark ? 4 : 5, radius * (spark ? 0.30 : 0.45), radius);
    if (slot < earned) star.setFillStyle(color);
    row.add(star.setStrokeStyle(2, color));
  }
  return row;
}
