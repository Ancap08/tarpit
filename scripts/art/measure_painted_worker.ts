// Cold production-mode Play, with one shaped HTTP link for both page and worker.
// PW_PORT=4373 node --experimental-strip-types scripts/art/measure_painted_worker.ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene';
import { waitForTitle } from '../../e2e/title.ts';

const port = Number(process.env.PW_PORT);
const root = resolve('dist');
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.css': 'text/css' };
let linkFree = 0;
let files: string[] = [];
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url!, 'http://localhost').pathname;
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) throw new Error('Invalid path');
    const body = await readFile(file);
    if (path.includes('/assets/painted/')) files.push(path);
    // Reserve a single 200,000 B/s link after 150 ms latency. The response is
    // released when its last byte would arrive. Our loader awaits full bodies.
    const now = performance.now();
    linkFree = Math.max(now + 150, linkFree) + body.length / 200;
    await delay(linkFree - now);
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': body.length, 'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((ready, reject) => server.once('error', reject).listen(port, '127.0.0.1', ready));
const browser = await chromium.launch();
try {
  for (const density of [1, 2]) {
    const context = await browser.newContext({ viewport: { width: 960, height: 580 }, deviceScaleFactor: density });
    try {
      await context.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { effectiveType: '4g', downlink: 10 } }));
      const page = await context.newPage();
      files = [];
      await page.goto(`http://127.0.0.1:${port}/?look=painted`, { waitUntil: 'domcontentloaded' });
      await waitForTitle(page);
      const point = await page.evaluate(() => {
        const api = window.__tarpit!;
        const r = api.uiRects()['title:play'];
        return api.canvasToPage(r.x + r.width / 2, r.y + r.height / 2);
      });
      assert.equal(files.length, 0);
      const start = performance.now();
      await page.mouse.click(point.x, point.y);
      await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
      const ms = Math.round(performance.now() - start);
      const actual = await page.evaluate(() => ({
        controlled: !!navigator.serviceWorker.controller,
        density: (window.__tarpit!.game.scene.getScene('game') as GameScene).paintedState().density,
      }));
      console.log(`Cold production Meadow ${density}x: ${ms} ms, ${files.length} HTTP art requests, worker controlled: ${actual.controlled}`);
      assert.equal(actual.controlled, true);
      assert.equal(actual.density, density);
      if (!process.argv.includes('--baseline')) {
        assert.ok(files.length > 0 && files.length <= 8);
        if (density === 1) assert.ok(ms < 5000);
      }
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
}
