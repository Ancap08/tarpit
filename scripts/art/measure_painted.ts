// Run against a production preview with PW_PORT set. A fresh context per density
// keeps both the HTTP cache and painted textures cold. Offline caching has its
// own browser test; blocking the worker keeps every byte on the throttled target.
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { waitForTitle } from '../../e2e/title.ts';

const browser = await chromium.launch();
try {
  for (const density of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 960, height: 580 }, deviceScaleFactor: density, serviceWorkers: 'block',
    });
    // Exercise both densities over the same wire speed, including the optional
    // 2x set that a browser reporting a 1.6 Mbps downlink would normally skip.
    await context.addInitScript(() => Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g', downlink: 10 },
    }));
    const page = await context.newPage();
    await page.goto(`http://localhost:${process.env.PW_PORT}/?test=1&look=painted`);
    await waitForTitle(page);
    const point = await page.evaluate(() => {
      const api = window.__tarpit!;
      const r = api.uiRects()['title:play'];
      return api.canvasToPage(r.x + r.width / 2, r.y + r.height / 2);
    });
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    await client.send('Network.emulateNetworkConditions', {
      offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750,
    });
    const start = performance.now();
    await page.mouse.click(point.x, point.y);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    const ms = Math.round(performance.now() - start);
    const data = await page.evaluate(() => {
      const art = performance.getEntriesByType('resource').filter(r => r.name.includes('/assets/painted/')) as PerformanceResourceTiming[];
      return { density: window.__tarpit!.painted!().density, requests: art.length,
        bytes: art.reduce((n, r) => n + r.encodedBodySize, 0) };
    });
    console.log(`Meadow ${density}x: ${ms} ms, ${data.requests} requests, ${data.bytes} body bytes`);
    assert.equal(data.density, density);
    if (!process.argv.includes('--baseline')) {
      assert.ok(data.requests > 0 && data.requests <= 8);
      if (density === 1) assert.ok(ms < 5000, '1x Meadow must open within five seconds');
    }
    await context.close();
  }
} finally {
  await browser.close();
}
