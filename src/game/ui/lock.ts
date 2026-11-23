import type Phaser from 'phaser';
import { COLORS } from '../palette';

/** Origin at the centre of the body's top edge. */
export function makeLock(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const lock = scene.add.graphics();
  lock.lineStyle(3, COLORS.buttonEdge);
  lock.beginPath().arc(0, 0, 5, Math.PI, 2 * Math.PI).strokePath();
  return lock.fillStyle(COLORS.buttonEdge).fillRoundedRect(-7, 0, 14, 12, 2);
}
