import type Phaser from 'phaser';
import type { Rect } from '../input';
import { isTestMode } from '../testMode';

export const SANS = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
export const CLEAN = {
  ground: 0x0b1e20, panel: 0x11292b, raised: 0x1c3437, edge: 0x557773,
  mint: 0xaaf1d9, mintDark: '#102b28', ink: '#effcf8', subdued: '#b9d4ce',
  gold: '#ffda92', rose: 0xff8d8f,
} as const;

export const PRINT = {
  ground: 0xeee7d5, sheet: 0xfff9eb, inset: 0xeee6d4, edge: 0xc5af92,
  ink: '#242b24', muted: '#4e5948', red: '#953c34', green: 0x234b40,
} as const;

type Graphics = Phaser.GameObjects.Graphics;
type Text = Phaser.GameObjects.Text;
type Scene = Phaser.Scene;
export type Skin = 'battle' | 'paper' | 'legacy';

const skins = new WeakMap<Scene, { skin: Skin; now: () => number; motion: boolean }>();

export function newInterface(): boolean {
  return typeof location !== 'undefined' && new URLSearchParams(location.search).get('ui') === 'new';
}

export function useInterface(scene: Scene, skin: Skin, now: () => number): void {
  const motion = !isTestMode() && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  skins.set(scene, { skin, now, motion });
  const previous = document.body.style.backgroundColor;
  document.body.style.backgroundColor = skin === 'battle' ? '#0b1e20' : '#eee7d5';
  scene.events.once('shutdown', () => {
    skins.delete(scene);
    document.body.style.backgroundColor = previous;
  });
}

export function skinFor(scene: Scene): Skin {
  return skins.get(scene)?.skin ?? 'legacy';
}

export function motionClock(scene: Scene): (() => number) | undefined {
  const ui = skins.get(scene);
  return ui?.motion ? ui.now : undefined;
}

// Phaser's WebGL Graphics walks each arc at a 0.01 radian interval. These
// short outlines are under 30 px in radius and need only four chords per
// corner. Keeping the points explicit avoids tessellating dense curves on
// every frame for small UI marks and outlines.
const corners = Array.from({ length: 4 }, (_, corner) =>
  Array.from({ length: 5 }, (_, i) => {
    const angle = (corner - 1) * Math.PI / 2 + i * Math.PI / 8;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }));

export function roundPoints(r: Rect, radius: number): { x: number; y: number }[] {
  const { x, y, width, height } = r;
  radius = Math.min(radius, width / 2, height / 2);
  const x0 = x + radius, x1 = x + width - radius;
  const y0 = y + radius, y1 = y + height - radius;
  return corners.flatMap((arc, i) => {
    const cx = i < 2 ? x1 : x0;
    const cy = i === 0 || i === 3 ? y0 : y1;
    return arc.map(p => ({ x: cx + radius * p.x, y: cy + radius * p.y }));
  });
}

export function rounded(g: Graphics, r: Rect, fill: number = CLEAN.panel, edge: number = CLEAN.edge, radius = 16, alpha = 1): void {
  if (r.width <= 0 || r.height <= 0) return;
  if (radius <= 1) {
    g.fillStyle(fill, alpha).fillRect(r.x, r.y, r.width, r.height);
    return;
  }
  const points = roundPoints(r, radius);
  g.fillStyle(fill, alpha).fillPoints(points, true);
  g.lineStyle(1, edge).strokePoints(points, true);
}

export function sheet(g: Graphics, r: Rect): void {
  for (let i = 3; i > 0; i--) {
    g.fillStyle(0x30271a, 0.046).fillPoints(roundPoints({
      x: r.x - i * 3, y: r.y + i * 3, width: r.width + i * 6, height: r.height + i * 2,
    }, 18), true);
  }
  rounded(g, r, PRINT.sheet, PRINT.edge, 16);
}

/** Draw a vector plate when its state changes, then render it as one quad. */
export class BakedPaint {
  readonly image: Phaser.GameObjects.Image;
  private readonly texture: Phaser.Textures.CanvasTexture;
  private readonly key: string;
  private bounds: Rect = { x: 0, y: 0, width: 1, height: 1 };

  constructor(scene: Scene, private readonly ink: Graphics) {
    this.key = `clean-plate:${scene.sys.settings.key}:${scene.children.getIndex(ink)}`;
    this.texture = scene.textures.createCanvas(this.key, 1, 1)!;
    this.image = scene.add.image(0, 0, this.key).setOrigin(0);
    ink.setVisible(false);
    scene.events.once('shutdown', () => {
      if (scene.textures.exists(this.key)) scene.textures.remove(this.key);
    });
  }

  begin(rect: Rect): Graphics {
    this.bounds = {
      x: Math.floor(rect.x) - 1, y: Math.floor(rect.y) - 1,
      width: Math.ceil(rect.width) + 3, height: Math.ceil(rect.height) + 3,
    };
    return this.ink.clear().save().translateCanvas(-this.bounds.x, -this.bounds.y);
  }

  finish(offset = 0): void {
    const { width, height } = this.bounds;
    this.ink.restore();
    if (this.texture.width !== width || this.texture.height !== height) this.texture.setSize(width, height);
    else this.texture.context.clearRect(0, 0, width, height);
    this.ink.generateTexture(this.key, width, height);
    this.shift(offset);
  }

  shift(offset: number): void {
    this.image.setPosition(this.bounds.x, this.bounds.y + offset);
  }
}

/** Stable line boxes even on platforms that report unusually tall glyph bounds. */
export function textMetrics(size: number) {
  const ascent = Math.ceil(size * .82);
  return { ascent, descent: size + 3 - ascent, fontSize: size + 3 };
}

export function sans(scene: Scene, x: number, y: number, text: string, size: number, color: string = CLEAN.ink, bold = false): Text {
  return scene.add.text(x, y, text, {
    fontFamily: SANS, fontSize: size, color, fontStyle: bold ? 'bold' : 'normal', metrics: textMetrics(size),
  });
}

export function line(g: Graphics, x: number, y: number, width: number, color: number = PRINT.edge): void {
  g.lineStyle(1, color).lineBetween(x, y, x + width, y);
}

/** Vectors use a centred 24-unit grid and share the line weights of the mock-up. */
const paths = {
  heart: [[0, 8, -8, 0, -8, -4, -5, -7, 0, -4, 5, -7, 8, -4, 8, 0, 0, 8]],
  wave: [[-10, -2, -7, -2, -3, -5, 0, -5, 4, -2, 7, -2, 10, -4], [-10, 5, -7, 5, -3, 2, 0, 2, 4, 5, 7, 5, 10, 3]],
  pause: [[-3, -7, -3, 7], [3, -7, 3, 7]],
  bolt: [[2, -10, -7, 2, -1, 2, -2, 10, 7, -2, 1, -2, 2, -10]],
  next: [[-7, -7, 2, 0, -7, 7, -7, -7], [6, -7, 6, 7]],
  play: [[-5, -7, 6, 0, -5, 7, -5, -7]],
  close: [[-6, -6, 6, 6], [6, -6, -6, 6]],
  arrow: [[-8, 0, 8, 0], [1, -7, 8, 0, 1, 7]],
  back: [[8, 0, -8, 0], [-1, -7, -8, 0, -1, 7]],
  volley: [[-7, 7, 4, -4], [-7, 1, -7, 7, -1, 7], [-1, -5, 4, -10], [3, 5, 9, -1]],
  target: [[0, -11, 0, -6], [0, 6, 0, 11], [-11, 0, -6, 0], [6, 0, 11, 0]],
  crown: [[-9, -6, -6, 5, 6, 5, 9, -6, 4, -2, 0, -8, -4, -2, -9, -6], [-6, 9, 6, 9]],
  window: [[-6, -9, 6, -9, 6, 9, -6, 9, -6, -9], [0, -9, 0, 9], [-6, 0, 6, 0]],
  sparkle: [[0, -10, 3, -3, 10, 0, 3, 3, 0, 10, -3, 3, -10, 0, -3, -3, 0, -10]],
  lock: [[-7, -1, 7, -1, 7, 9, -7, 9, -7, -1], [-4, -1, -4, -6, 0, -9, 4, -6, 4, -1]],
  map: [[-9, -5, -3, -8, 3, -5, 9, -8, 9, 6, 3, 9, -3, 6, -9, 9, -9, -5], [-3, -8, -3, 6], [3, -5, 3, 9]],
  replay: [[-8, -8, -8, -1, -1, -1], [-8, -1, -4, -7, 2, -8, 7, -4, 8, 2, 5, 7, -1, 8, -6, 5]],
  audio: [[-10, -3, -6, -3, -1, -7, -1, 7, -6, 3, -10, 3, -10, -3], [2, -4, 5, -2, 5, 2, 2, 4], [5, -7, 9, -4, 9, 4, 5, 7]],
  muted: [[-10, -3, -6, -3, -1, -7, -1, 7, -6, 3, -10, 3, -10, -3], [3, -4, 10, 4], [10, -4, 3, 4]],
  coin: [[2, -4, -2, -4, -3, -2, 3, 2, 2, 4, -2, 4], [0, -6, 0, 6]],
} as const;

export type Icon = keyof typeof paths;

export function glyph(g: Graphics, icon: Icon, x: number, y: number, size: number, color: number, alpha = 1): void {
  const s = size / 24;
  g.lineStyle(1.8 * s, color, alpha);
  if (icon === 'coin') g.strokeEllipse(x, y, 18 * s, 18 * s, 18);
  if (icon === 'target') g.strokeEllipse(x, y, 14 * s, 14 * s, 14).strokeEllipse(x, y, 4 * s, 4 * s, 8);
  for (const points of paths[icon]) {
    g.beginPath().moveTo(x + points[0] * s, y + points[1] * s);
    for (let i = 2; i < points.length; i += 2) g.lineTo(x + points[i] * s, y + points[i + 1] * s);
    g.strokePath();
  }
}
