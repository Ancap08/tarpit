import type Phaser from 'phaser';
import { MAP_HEIGHT, MAP_WIDTH } from '../../sim';
import type { Layout } from '../layout';

/**
 * Continue the board's terrain across the portrait gutters. The world-space
 * y edges become the screen's left and right edges after the quarter turn.
 * Bake the reflection and its soft shade into the ground's single draw.
 */
export function extendPortraitGround(
  scene: Phaser.Scene, layout: Layout, source: CanvasImageSource, density: number,
): Phaser.GameObjects.Image {
  const fringe = Math.ceil(layout.map.x);
  const width = MAP_WIDTH;
  const height = MAP_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height + 2 * fringe;
  const ctx = canvas.getContext('2d')!;
  // The portrait world buffer has at most one sample per map unit. Keep
  // this session texture at 1× even when the underlying art loaded at 2×.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, fringe, width, height);
  // The outer two cells contain terrain and, on Riverbend, the river
  // mouth. Stretch just that edge strip so the trail never repeats.
  const sample = Math.min(64, fringe);
  for (const top of [true, false]) {
    const edge = top ? fringe : fringe + height;
    ctx.save();
    ctx.translate(0, edge);
    ctx.scale(1, -1);
    ctx.drawImage(source, 0, top ? 0 : (height - sample) * density, width * density, sample * density,
      0, top ? 0 : -fringe, width, fringe);
    ctx.restore();

    const end = edge + (top ? -fringe : fringe);
    const shade = ctx.createLinearGradient(0, edge, 0, end);
    shade.addColorStop(0, 'rgba(17, 36, 32, .06)');
    shade.addColorStop(1, 'rgba(17, 36, 32, .24)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, Math.min(edge, end), width, fringe);
  }
  const key = 'clean:portrait-ground';
  const texture = scene.textures.addCanvas(key, canvas)!;
  const image = scene.add.image(0, 0, texture).setOrigin(0);
  layout.placeWorld(image);
  image.x += fringe;
  scene.events.once('shutdown', () => scene.textures.remove(key));
  return image;
}
