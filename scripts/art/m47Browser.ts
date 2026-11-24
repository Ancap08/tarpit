// Shared production preview for the M47 reports. A busy port fails immediately.
import assert from 'node:assert/strict';
import { chromium, devices, type Browser, type LaunchOptions, type Page } from '@playwright/test';
import { preview } from 'vite';
import { waitForTitle, waitForFirstScreen } from '../../e2e/title.ts';

const port = Number(process.env.PW_PORT);
assert.ok(Number.isInteger(port) && port > 0, 'Set PW_PORT to a dedicated preview port.');
export const origin = `http://127.0.0.1:${port}`;
export const phone = { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3, hasTouch: true, isMobile: true };
export const landscape = { ...devices['Desktop Chrome'], viewport: { width: 960, height: 580 }, deviceScaleFactor: 1 };

export async function run(work: (browser: Browser) => Promise<void>, launchOptions: LaunchOptions = {}): Promise<void> {
  const server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port, strictPort: true } });
  try {
    const browser = await chromium.launch(launchOptions);
    try { await work(browser); } finally { await browser.close(); }
  } finally { await server.close(); }
}

export async function press(page: Page, key: string, touch = false): Promise<void> {
  await page.waitForFunction(key => !!window.__tarpit?.uiRects()[key], key);
  const p = await page.evaluate(key => {
    const api = window.__tarpit!, r = api.uiRects()[key];
    return api.canvasToPage(r.x + r.width / 2, r.y + r.height / 2);
  }, key);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

export async function start(page: Page, search: string, campaign = false, touch = false): Promise<void> {
  await page.goto(origin + '/?' + search);
  if (campaign) {
    await waitForFirstScreen(page, { showTips: true });
    await press(page, 'title:campaign', touch);
    await press(page, 'title:stop:1', touch);
    await press(page, 'title:play', touch);
    await press(page, 'title:gotIt', touch);
  } else {
    await waitForTitle(page);
    await press(page, 'title:play', touch);
  }
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await page.evaluate(() => window.__tarpit!.setMuted(true));
}
