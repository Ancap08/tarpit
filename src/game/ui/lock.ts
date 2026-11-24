import type Phaser from 'phaser';
import { lock } from './theme';

/** Origin at the centre of the body's top edge. */
export function makeLock(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  lock(g, 0, 3, 15);
  return g;
}
