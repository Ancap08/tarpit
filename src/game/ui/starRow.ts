import type Phaser from 'phaser';

export const STAR_ROW = 'campaignStars';

/** A feat level uses the four-pointed spark for its third slot, filled or empty. */
export function drawStarRow(scene: Phaser.Scene, x: number, y: number, earned: number, size: number, cssColor: string, feat: boolean, printed = false) {
  const row = scene.add.container(x, y).setName(STAR_ROW);
  const color = parseInt(cssColor.slice(1), 16);
  const radius = size / 2 - 1;
  for (let slot = 0; slot < 3; slot++) {
    const spark = feat && slot === 2;
    const star = scene.add.star((slot - 1) * (size + (printed ? 10 : 2)), 0, spark ? 4 : 5, radius * (spark ? 0.30 : 0.45), radius);
    if (slot < earned) star.setFillStyle(printed ? spark ? 0xe4aa8f : 0xead4a3 : color);
    row.add(star.setStrokeStyle(printed ? 3 : 2, printed ? spark ? 0x943c35 : 0xad7539 : color));
  }
  return row;
}
