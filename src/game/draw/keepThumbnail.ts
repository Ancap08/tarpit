import type Phaser from 'phaser';
import type { LevelDef } from '../../sim';

const KEY = 'siege:thumbnails';
const WIDTH = 320;
const HEIGHT = 160;

export function loadKeepThumbnails(scene: Phaser.Scene): void {
  if (!scene.textures.exists(KEY)) {
    scene.load.image(KEY, import.meta.env.BASE_URL + 'assets/act3/keep-thumbnails.webp');
  }
  scene.events.once('shutdown', () => scene.textures.remove(KEY));
}

export function drawKeepThumbnail(scene: Phaser.Scene, level: LevelDef, x: number, y: number, width: number) {
  const atlas = scene.textures.get(KEY);
  const frame = level.keepSky === 'dawn' ? 3 : level.keepSky === 'night storm' ? 2 : level.keepRoads === 'west' ? 1 : 0;
  const name = String(frame);
  if (!atlas.has(name)) atlas.add(name, 0, frame % 2 * WIDTH, Math.floor(frame / 2) * HEIGHT, WIDTH, HEIGHT);
  return scene.add.image(x, y, KEY, name).setName('keep-thumbnail').setOrigin(.5, 0).setDisplaySize(width, width / 2);
}
