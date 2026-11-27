// Relight the existing painted poses, including their hit frames. A derived sheet
// keeps the same anchors and alpha silhouette on both Canvas and WebGL.
import Phaser from 'phaser';

export class KeepLight {
  private readonly variants = new Map<string, Phaser.Textures.Texture>();

  constructor(private readonly textures: Phaser.Textures.TextureManager, private readonly moonlit = false,
      private readonly rentOverdue = false) {}

  readonly key = (key: string): string => {
    if (key.startsWith('painted:harpy-shadow:') || key.startsWith('painted:sharp:')) return key;
    const cached = this.variants.get(key);
    if (cached) return cached.key;
    const source = this.textures.get(key);
    const image = source.source[0].image as HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    if (this.rentOverdue && /^painted:(goblin|wolf|shieldbearer|troll|harpy):/.test(key)) {
      inkRentEnemy(ctx, 2);
    } else {
      lightKeepPixels(ctx, this.moonlit);
    }
    const texture = this.textures.create((this.moonlit ? 'keep:moon:' : 'keep:dusk:') + source.key, canvas)!;
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

/** Keep the same poses and anchors. A dark contour goes inside the existing
 * alpha silhouette, so neither frames nor decoded sheets need extra padding. */
export function inkRentEnemy(ctx: CanvasRenderingContext2D, density: number): void {
  const { width, height } = ctx.canvas;
  const pixels = ctx.getImageData(0, 0, width, height);
  const rgba = pixels.data;
  const inset = Math.max(1, Math.round(density * 1.25));
  const span = width * 4 * inset;
  const step = inset * 4;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!rgba[i + 3]) continue;
    const edge = Math.min(x >= inset ? rgba[i - step + 3] : 0,
      x + inset < width ? rgba[i + step + 3] : 0,
      y >= inset ? rgba[i - span + 3] : 0,
      y + inset < height ? rgba[i + span + 3] : 0);
    if (edge < 95) {
      rgba[i] = 30;
      rgba[i + 1] = 29;
      rgba[i + 2] = 24;
    } else {
      const value = .24 * rgba[i] + .63 * rgba[i + 1] + .13 * rgba[i + 2];
      rgba[i] = rgba[i] * .49 + value * .16 + 17;
      rgba[i + 1] = rgba[i + 1] * .47 + value * .15 + 12;
      rgba[i + 2] = rgba[i + 2] * .46 + value * .12 + 7;
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

/** Relight a sheet in place before registering it with Phaser. */
export function lightKeepPixels(ctx: CanvasRenderingContext2D, moonlit: boolean): void {
  const { canvas } = ctx;
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
      if (moonlit) {
        const east = x + 1 < canvas.width ? 1 - rgba[i + 7] / 255 : 1;
        const rim = Math.max(west * .8, east * .65, top);
        rgba[i] = r * .86 + value * .2 + rim * 41 + 13;
        rgba[i + 1] = g * .89 + value * .22 + rim * 57 + 17;
        rgba[i + 2] = b * .93 + value * .25 + rim * 80 + 25;
      } else {
        rgba[i] = r * .53 + value * .24 + west * 77 + top * 20;
        rgba[i + 1] = g * .47 + value * .27 + west * 35 + top * 30;
        rgba[i + 2] = b * .55 + value * .37 + west * 16 + top * 47 + 8;
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
}
