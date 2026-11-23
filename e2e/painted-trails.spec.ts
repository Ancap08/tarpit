import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { MAP_IDS, MAPS } from '../src/sim/map';

for (const mapId of MAP_IDS) {
  test(`painted ${mapId} trail follows its simulation segments and bends at both densities`, async ({ page }) => {
    const path = MAPS[mapId].path;
    for (const density of [1, 2]) {
      const file = await readFile(`assets/art-painted/packed/${mapId}-${density}x.webp`);
      const errors = await page.evaluate(async ({ path, density, data }) => {
        const image = new Image();
        image.src = 'data:image/webp;base64,' + data;
        await image.decode();
        const board = document.createElement('canvas');
        board.width = image.width;
        board.height = image.height;
        if (board.width !== 960 * density || board.height !== 480 * density)
          throw new Error(`Wrong plate size: ${board.width} × ${board.height}`);
        const ctx = board.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const { data: pixels } = ctx.getImageData(0, 0, image.width, image.height);
        const errors: string[] = [];
        function warmth(x: number, y: number) {
          const k = 4 * (Math.floor(y * density) * board.width + Math.floor(x * density));
          return pixels[k] - pixels[k + 1];
        }
        function check(x: number, y: number, nx: number, ny: number) {
          // The Meadow review samples the 40 px strip at 16 px (earth)
          // and 27 px (grass). Compare hues to include the timber crossing.
          const verge = warmth(x + 27 * nx, y + 27 * ny);
          if (Math.min(warmth(x, y), warmth(x + 16 * nx, y + 16 * ny)) < verge + 8)
            errors.push(`(${x},${y}) toward (${nx},${ny})`);
        }
        for (let i = 1; i < path.length; i++) {
          const a = path[i - 1], b = path[i];
          const dx = Math.sign(b.x - a.x), dy = Math.sign(b.y - a.y);
          const length = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
          // Near an inside corner the adjoining strip covers the verge.
          for (let t = i === 1 ? 0 : 28; t < length - (i === path.length - 1 ? 0 : 27); t += 4) {
            check(a.x + t * dx, a.y + t * dy, -dy, dx);
            check(a.x + t * dx, a.y + t * dy, dy, -dx);
          }
          if (i < path.length - 1) {
            const c = path[i + 1];
            check(b.x, b.y, (dx - Math.sign(c.x - b.x)) / Math.SQRT2,
              (dy - Math.sign(c.y - b.y)) / Math.SQRT2);
          }
        }
        return errors;
      }, { data: file.toString('base64'), path, density });
      expect(errors, `${density}x trail samples`).toEqual([]);
    }
  });
}
