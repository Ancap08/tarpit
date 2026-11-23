// Generate the twelve milestone 43 review JPEGs from a production preview.
// PW_PORT=4373 node --experimental-strip-types scripts/art/review_painted.ts
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { waitForTitle } from '../../e2e/title.ts';
import type { TarpitTestApi } from '../../src/game/testGlobal';

const output = 'docs/art/painted-maps';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch();
try {
  for (const layout of ['landscape', 'phone'] as const) {
    const phone = layout === 'phone';
    const page = await browser.newPage({
      viewport: phone ? { width: 390, height: 844 } : { width: 960, height: 580 },
      deviceScaleFactor: phone ? 3 : 1, hasTouch: phone, isMobile: phone,
    });
    for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
      await page.goto(`http://localhost:${process.env.PW_PORT}/?test=1&look=painted`);
      await waitForTitle(page);
      await page.evaluate(map => (window.__tarpit as TarpitTestApi).startGame('normal', map), map);
      assert.deepEqual(await page.evaluate(() => {
        const t = window.__tarpit as TarpitTestApi;
        return [t.state().map.id, t.painted().active, t.painted().density];
      }), [map, true, phone ? 2 : 1]);
      for (const shot of ['empty', 'midwave']) {
        if (shot === 'midwave') {
          const frame = await page.evaluate(() => {
            const t = window.__tarpit as TarpitTestApi;
            t.runScript('comboBuild', 7);
            t.startWave();
            t.step(1440);
            const s = t.state();
            return { wave: s.wave, towers: s.towers.length, enemies: s.enemies.length };
          });
          assert.ok(frame.wave === 7 && frame.towers >= 3 && frame.enemies >= 7, JSON.stringify(frame));
          console.log(map, layout, frame);
        }
        await page.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        });
        await page.screenshot({
          path: `${output}/${map}-${layout}-${shot}.jpg`, scale: 'css', quality: 86,
        });
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}
