import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, ICONS, pngSize, render } from './make-icons';

describe('make-icons', () => {
  it('encodes a PNG whose IHDR and pixels round-trip', () => {
    const rgba = render(8);
    const png = encodePng(8, 8, rgba);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(pngSize(png)).toEqual({ width: 8, height: 8 });
    const idatLen = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    expect(raw.length).toBe((8 * 4 + 1) * 8);
    expect([...raw.subarray(1, 5)]).toEqual([...rgba.subarray(0, 4)]);
  });

  it('the committed icons have the sizes the manifest and index.html state', () => {
    for (const { file, size } of ICONS) {
      const png = readFileSync(new URL(`../public/icons/${file}`, import.meta.url));
      expect(pngSize(png), file).toEqual({ width: size, height: size });
    }
  });
});
