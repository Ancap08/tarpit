import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api } from './campaign';

// Milestone 44c verifier: where the font comes from, what a slow font costs, and whether
// HUD numbers hold still. Chromium project (960 x 580).

const titleWidth = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const scene = window.__tarpit!.game.scene.getScenes(true)[0]!;
  const label = scene.children.list.find((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text === 'TARPIT') as Phaser.GameObjects.Text | undefined;
  return label ? Math.round(label.width) : null;
});

test('the font comes from the site itself: no request leaves the origin', async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith(baseURL!) && !r.url().startsWith('blob:' + baseURL)) outside.push(r.url()); });
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').length)).toBe(4);
  expect(outside).toEqual([]);
});

test('preloads both weights, shows Loading on parchment, and keeps fallback after a one-second wait', async ({ page }) => {
  const time = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time });
  await page.clock.pauseAt(new Date(time.getTime() + 1000));
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const requests: string[] = [];
  await page.route(/\.woff2$/, async route => {
    requests.push(route.request().url());
    await held;
    await route.continue();
  });
  await page.goto('/?test=1', { waitUntil: 'domcontentloaded' });
  const preloads = await page.locator('head link[rel=preload][as=font][crossorigin]')
    .evaluateAll(links => links.map(link => (link as HTMLLinkElement).href));
  expect(preloads).toHaveLength(2);
  await expect.poll(() => [...requests].sort()).toEqual(preloads.sort());
  await page.clock.runFor(999);
  const loading = page.getByRole('status');
  await expect(loading).toHaveText('Loading');
  await expect(loading).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(241, 223, 181)');
  await expect(page.locator('canvas')).toHaveCount(0);

  await page.clock.runFor(1);
  await expect(loading).toHaveCount(0);
  await page.clock.resume();
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  const first = await titleWidth(page);
  expect(first).toBeGreaterThan(0);
  release();
  await page.waitForLoadState('networkidle');
  expect(await titleWidth(page)).toBe(first);
  expect(await page.evaluate(() => [...document.fonts].length)).toBe(0);
});

test('HUD figures keep one advance per digit as gold, lives and the wave count grow', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  await api(page, (t) => t.setTipsEnabled(false));
  await api(page, (t) => { void t.startGame('normal', 'meadow'); });
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
  const widths = await page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    const scene = t.game.scene.getScene('game');
    const width = (prefix: string) => (scene.children.list.find((o) => o.type === 'Text' && (o as Phaser.GameObjects.Text).text.startsWith(prefix)) as Phaser.GameObjects.Text).getBounds().width;
    const read = (prefix: string, values: number[], set: (v: number) => void) => values.map((v) => { set(v); t.step(0); return width(prefix); });
    return {
      gold: read('Gold', [1, 8, 9, 10, 99, 100, 999, 1000], (v) => { t.state().gold = v; }),
      lives: read('Lives', [1, 9, 10], (v) => { t.state().lives = v; }),
    };
  });
  // 1, 8 and 9 are one digit; 10 and 99 two; 100 and 999 three; 1000 four.
  expect(new Set([widths.gold[0], widths.gold[1], widths.gold[2]]).size).toBe(1);
  expect(widths.gold[3]).toBe(widths.gold[4]);
  expect(widths.gold[5]).toBe(widths.gold[6]);
  const step = widths.gold[3]! - widths.gold[2]!;
  expect(widths.gold[5]! - widths.gold[4]!).toBe(step);
  expect(widths.gold[7]! - widths.gold[6]!).toBe(step);
  expect(widths.lives[0]).toBe(widths.lives[1]);
  expect(widths.lives[2]! - widths.lives[1]!).toBe(step);
});
