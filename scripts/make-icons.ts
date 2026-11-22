// `node --experimental-strip-types scripts/make-icons.ts` (run by hand,
// milestone 32a): draws the home-screen icon in the game's placeholder
// style (flat shapes in palette colours: a dark tar pool on the path and a
// stone tower on the green field) and writes the PNGs to public/icons/.
// The output is committed and listed in assets/MANIFEST.md. No image
// library: shapes are sampled 4 x 4 per pixel and written by the small PNG
// encoder below (node:zlib only).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

type Rgb = [number, number, number];

/** Palette colours (src/game/palette.ts). */
const C = {
  grass: 0x5f7f4a,
  path: 0xc2a476,
  pathEdge: 0x9c7f55,
  tar: 0x2e2118,
  tarRim: 0x4a3e35,
  tarHighlight: 0xd8d0c4,
  stone: 0x8a8d92,
  stoneEdge: 0x45484d,
  door: 0x18191b,
  flag: 0xe0473a,
} as const;

const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/** A shape in unit space (0..1, y down): true where the point is inside. */
type Shape = (x: number, y: number) => boolean;
type Layer = [Shape, number];

const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x < x1 && y >= y0 && y < y1;
const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => (x, y) =>
  ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const union = (...s: Shape[]): Shape => (x, y) => s.some((f) => f(x, y));
const grow = (cx: number, cy: number, k: number, s: Shape): Shape => (x, y) => s(cx + (x - cx) / k, cy + (y - cy) / k);

/** The tower: a crenellated stone turret (a dark door and a red pennant are separate layers). */
const towerShape: Shape = union(
  rect(0.25, 0.3, 0.53, 0.68),
  rect(0.22, 0.22, 0.56, 0.32),
  rect(0.22, 0.14, 0.3, 0.22),
  rect(0.35, 0.14, 0.43, 0.22),
  rect(0.48, 0.14, 0.56, 0.22),
);

/** Layers for the icon, painted in order; `k` shrinks everything about the centre (maskable). */
export function layers(k = 1): Layer[] {
  const s = (shape: Shape) => (k === 1 ? shape : grow(0.5, 0.5, k, shape));
  const edge = 0.025;
  const towerEdge: Shape = (x, y) =>
    towerShape(x, y) || towerShape(x + edge, y) || towerShape(x - edge, y) || towerShape(x, y + edge) || towerShape(x, y - edge);
  const pathBand: Shape = (x, y) => Math.abs(y - (0.74 - 0.12 * x)) < 0.13;
  const pathRim: Shape = (x, y) => Math.abs(y - (0.74 - 0.12 * x)) < 0.15;
  return [
    [pathRim, C.pathEdge],
    [pathBand, C.path],
    [s(towerEdge), C.stoneEdge],
    [s(towerShape), C.stone],
    [s(rect(0.34, 0.5, 0.44, 0.68)), C.door],
    [s(rect(0.385, 0.03, 0.405, 0.15)), C.stoneEdge],
    [s((x, y) => x >= 0.405 && x < 0.52 && y >= 0.03 && y < 0.1 - (x - 0.405) * 0.3), C.flag],
    [s(ellipse(0.66, 0.68, 0.27, 0.16)), C.tarRim],
    [s(ellipse(0.66, 0.69, 0.24, 0.13)), C.tar],
    [s(ellipse(0.57, 0.64, 0.05, 0.022)), C.tarHighlight],
    [s(ellipse(0.75, 0.73, 0.03, 0.015)), C.tarHighlight],
  ];
}

/** Render to RGBA bytes, `size` x `size`, background grass, 4 x 4 samples per pixel. */
export function render(size: number, k = 1): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const ls = layers(k);
  const bg = rgb(C.grass);
  const N = 4;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < N; sy++) {
        for (let sx = 0; sx < N; sx++) {
          const x = (px + (sx + 0.5) / N) / size;
          const y = (py + (sy + 0.5) / N) / size;
          let c = bg;
          for (const [shape, colour] of ls) if (shape(x, y)) c = rgb(colour);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const i = (py * size + px) * 4;
      out[i] = Math.round(acc[0] / (N * N));
      out[i + 1] = Math.round(acc[1] / (N * N));
      out[i + 2] = Math.round(acc[2] / (N * N));
      out[i + 3] = 255;
    }
  }
  return out;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Encode RGBA bytes as an 8-bit RGBA PNG (filter 0 on every row). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

/** Width and height from a PNG's IHDR. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const b = Buffer.from(png);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

/**
 * The icon files: name, pixel size and scale. Maskable keeps the drawing
 * inside the central 80% safe zone (k = 0.8); the grass fills the rest.
 */
export const ICONS: { file: string; size: number; k: number }[] = [
  { file: 'icon-192.png', size: 192, k: 1 },
  { file: 'icon-512.png', size: 512, k: 1 },
  { file: 'icon-maskable-512.png', size: 512, k: 0.8 },
  { file: 'apple-touch-icon.png', size: 180, k: 1 },
];

function main(): void {
  const dir = fileURLToPath(new URL('../public/icons', import.meta.url));
  mkdirSync(dir, { recursive: true });
  for (const { file, size, k } of ICONS) {
    const png = encodePng(size, size, render(size, k));
    writeFileSync(join(dir, file), png);
    console.log(`make-icons: public/icons/${file} ${size}x${size} ${png.length} bytes`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
