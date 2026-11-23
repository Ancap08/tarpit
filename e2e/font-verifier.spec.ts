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

test('a font held for 5 s: the game starts in the fallback at about 2 s and never changes its text widths', async ({ page }) => {
  await page.route(/\.woff2/, async (route) => {
    if (route.request().resourceType() !== 'font') return route.continue();
    await new Promise((r) => setTimeout(r, 5000));
    await route.continue().catch(() => undefined);
  });
  const t0 = Date.now();
  await page.goto('/?test=1', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__tarpit?.titleReady?.(), undefined, { timeout: 4000 });
  expect(Date.now() - t0).toBeLessThan(3500);
  const first = await titleWidth(page);
  await page.waitForTimeout(4000); // the held font arrives
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
