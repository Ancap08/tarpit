// Relight the existing painted poses, including their hit frames. A derived sheet
// keeps the same anchors and alpha silhouette on both Canvas and WebGL.
import Phaser from 'phaser';

export class KeepLight {
  private readonly variants = new Map<string, Phaser.Textures.Texture>();

  constructor(private readonly textures: Phaser.Textures.TextureManager) {}

  readonly key = (key: string): string => {
    if (key.startsWith('painted:harpy-shadow:')) return key;
    const cached = this.variants.get(key);
    if (cached) return cached.key;
    const source = this.textures.get(key);
    const image = source.source[0].image as HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const rgba = pixels.data;
    // The sun catches the western edge and the cloud light grazes upper edges.
    const stride = canvas.width * 4;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = y * stride + x * 4;
        if (!rgba[i + 3]) continue;
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        const value = .27 * r + .55 * g + .18 * b;
        const west = x ? 1 - rgba[i - 1] / 255 : 1;
        const top = y ? 1 - rgba[i - stride + 3] / 255 : 1;
        rgba[i] = r * .53 + value * .24 + west * 77 + top * 20;
        rgba[i + 1] = g * .47 + value * .27 + west * 35 + top * 30;
        rgba[i + 2] = b * .55 + value * .37 + west * 16 + top * 47 + 8;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = this.textures.create('keep:dusk:' + source.key, canvas)!;
    texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    for (const frame of Object.values(source.frames)) {
      if (frame.name !== '__BASE') texture.add(frame.name, 0, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight);
    }
    this.variants.set(source.key, texture);
    return texture.key;
  };

  destroy() {
    for (const { key } of this.variants.values()) this.textures.remove(key);
    this.variants.clear();
  }
}
