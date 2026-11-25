// Compare frozen canvases, sim states and request inventories with a production build
// of the M50 main commit. Set M51_BASE to its build root (containing dist/).
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { phone, landscape, origin, run } from './m47Browser.ts';
import { waitForTitle } from '../../e2e/title.ts';

const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const base = process.env.M51_BASE;
assert.ok(base);
const candidate = process.cwd();
async function measure(root: string) {
  process.chdir(root);
  const rows: unknown[] = [];
  await run(async browser => {
    for (const profile of [phone, landscape]) {
      for (const look of ['classic', 'painted', 'showpiece']) {
        for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
          const ctx = await browser.newContext(profile);
          try {
            const page = await ctx.newPage();
            const requests: string[] = [];
            page.on('request', request => {
              const url = new URL(request.url());
              if (url.origin === origin && url.protocol === 'http:') requests.push(url.pathname
                .replace(/-[\w-]{8}\.(js|webp|woff2|png)$/, '.$1'));
            });
            await page.goto(origin + '/?test=1&look=' + look);
            await waitForTitle(page);
            await page.evaluate(map => window.__tarpit!.startGame!('normal', map), map);
            await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
            const frame = async () => {
              const bytes = await page.locator('canvas').screenshot({scale:'css'});
              return [digest(bytes), digest(await page.evaluate(() => JSON.stringify(window.__tarpit!.state!())))];
            };
            const setup = await frame();
            await page.evaluate(() => {
              const api = window.__tarpit!;
              api.startWave!();
              api.step!(420);
            });
            rows.push([profile.viewport, look, map, setup, await frame(), requests.sort()]);
          } finally { await ctx.close(); }
        }
      }
    }
  });
  return rows;
}
const receipt = join(base, 'keep-isolation.json');
if (process.argv.includes('--baseline')) {
  await writeFile(receipt, JSON.stringify(await measure(base)));
} else {
  const current = await measure(candidate);
  assert.deepEqual(current, JSON.parse(await readFile(receipt, 'utf8')));
  console.log('36 frozen canvas and state pairs and 18 cold request inventories match the main build.');
}
