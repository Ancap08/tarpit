import type Phaser from 'phaser';
import type { TownCondition } from '../decor/townCondition';
import { THEME, town } from './theme';

const urls = import.meta.glob<string>('../../../assets/art-painted/town-portraits/*.webp', {
  eager: true, import: 'default', query: '?url&no-inline',
});

/** The printed vignette also works offline, even before the first colour plate has been cached. */
function vignette(scene: Phaser.Scene, condition: TownCondition): string {
  const key = 'town-vignette-' + condition;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({}, false);
  town(g, 112, 93);
  const taken = condition === 'taken';
  const flagY = condition === 'battered' ? 51 : 24;
  g.fillStyle(THEME.ink).fillRect(167, 23, 3, 69);
  g.fillStyle(taken ? THEME.red : THEME.blue).fillRect(170, flagY, 28, taken ? 22 : 14);
  g.fillStyle(THEME.brass).fillCircle(180, flagY + 7, 3);
  if (condition !== 'untouched') {
    const n = condition === 'scuffed' ? 2 : 4;
    for (let i = 0; i < n; i++) g.fillStyle(THEME.ink, 0.23).fillEllipse(80 - i * 4, 56 - i * 6, 7 + i * 3, 6 + i);
  }
  g.generateTexture(key, 240, 120);
  g.destroy();
  return key;
}

// Cache the four colour plates as browser images. Each result owns its GPU
// textures and releases them when the panel closes or its scene shuts down.
const plates = new Map<TownCondition, Promise<HTMLImageElement>>();

function loadPlate(condition: TownCondition): Promise<HTMLImageElement> {
  const cached = plates.get(condition);
  if (cached) return cached;
  const plate = new Image();
  plate.src = urls[`../../../assets/art-painted/town-portraits/${condition}.webp`];
  const ready = plate.decode().then(() => plate);
  plates.set(condition, ready);
  return ready;
}

export function townPortrait(scene: Phaser.Scene, condition: TownCondition): Phaser.GameObjects.Image {
  const textures = scene.textures;
  const key = 'town-portrait-' + condition;
  const fallback = vignette(scene, condition);
  const image = scene.add.image(0, 0, fallback).setName('town-picture:' + condition);
  image.once('destroy', () => {
    if (textures.exists(key)) textures.remove(key);
    if (textures.exists(fallback)) textures.remove(fallback);
  });
  const ready = loadPlate(condition);
  void ready.then(plate => {
    if (!image.scene) return;
    textures.addImage(key, plate);
    const { displayWidth, displayHeight } = image;
    image.setTexture(key).setDisplaySize(displayWidth, displayHeight);
    textures.remove(fallback);
  }, () => {
    // Leave the printed vignette visible. A later online result can retry.
    if (plates.get(condition) === ready) plates.delete(condition);
  });
  return image;
}
