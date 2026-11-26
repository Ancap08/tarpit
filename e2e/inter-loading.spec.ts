import { existsSync } from 'node:fs';
import { expect, test, webkit, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { INTER } from '../src/game/palette';
import { press } from './campaign';
import { waitForTitle } from './title';

const fontRequest = '**/Inter-Latin-Variable-*.woff2';
const gameUrl = '/?test=1&ui=new&look=classic';

async function openLevel(page: Page) {
  await waitForTitle(page);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
}

async function gameLabels(page: Page) {
  return page.evaluate(() => {
    const t = window.__tarpit!;
    const scene = t.game.scene.getScene('game') as GameScene;
    const caption = scene.children.getByName('hud-stat:0') as Phaser.GameObjects.Text;
    const name = scene.children.getByName('bar-name:musketeer') as Phaser.GameObjects.Text;
    return [caption, name, scene['hud']['gold']].map(label => {
      const { x, y, width, height } = label.getBounds();
      return { family: label.style.fontFamily, weight: label.style.fontStyle,
        x, y, width, height, pixels: label.canvas.toDataURL() };
    });
  });
}

async function variableWeights(page: Page) {
  await openLevel(page);
  const labels = await gameLabels(page);
  expect(labels.map(label => label.weight)).toEqual(['400', '600', '600']);
  for (const label of labels) expect(label.family).toContain(INTER);
  const advances = await page.evaluate(family => {
    const face = [...document.fonts].find(face => face.family === family);
    const ctx = document.createElement('canvas').getContext('2d')!;
    const sample = 'Musketeer 186';
    ctx.font = `400 64px "${family}"`;
    const regular = ctx.measureText(sample).width;
    ctx.font = `600 64px "${family}"`;
    const semibold = ctx.measureText(sample).width;
    return { range: face?.weight, status: face?.status, regular, semibold };
  }, INTER);
  expect(advances).toMatchObject({ range: '100 900', status: 'loaded' });
  // Synthesizing bold adds ink to the 400 outlines without changing advances.
  expect(advances.semibold).toBeGreaterThan(advances.regular);
  await test.info().attach('Inter canvas advances', { body: JSON.stringify(advances), contentType: 'application/json' });
}

test('waits for Inter before painting and renders both variable weights in Chromium', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested!: (url: string) => void;
  const request = new Promise<string>(resolve => { requested = resolve; });
  await page.route(fontRequest, async route => {
    requested(route.request().url());
    await held;
    await route.continue();
  });
  const navigation = page.goto(gameUrl, { waitUntil: 'domcontentloaded' });
  try {
    expect(new URL(await request).origin).toBe(new URL(page.url()).origin);
    expect(await page.locator('canvas').count()).toBe(0);
  } finally {
    release();
  }
  await navigation;
  await variableWeights(page);
});

test('a font arriving after the one-second deadline leaves the first session in the device font', async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route(fontRequest, async route => {
    await held;
    await route.continue();
  });
  await page.addInitScript(family => {
    const load = FontFace.prototype.load;
    FontFace.prototype.load = function () {
      if (this.family === family) document.documentElement.dataset.interStarted = String(performance.now());
      return load.call(this).then(face => {
        if (face.family === family) document.documentElement.dataset.interSettled = face.status;
        return face;
      });
    };
  }, INTER);
  await page.goto(gameUrl, { waitUntil: 'domcontentloaded' });
  try {
    await waitForTitle(page);
    const elapsed = await page.evaluate(() => performance.now() - Number(document.documentElement.dataset.interStarted));
    expect(elapsed).toBeGreaterThanOrEqual(990);
    await openLevel(page);
    const before = await gameLabels(page);
    for (const label of before) {
      expect(label.family).toContain('system-ui');
      expect(label.family).not.toContain(INTER);
    }
    release();
    await expect(page.locator('html')).toHaveAttribute('data-inter-settled', 'loaded');
    expect(await gameLabels(page)).toEqual(before);
    expect(await page.evaluate(family => [...document.fonts].some(face => face.family === family), INTER)).toBe(false);
  } finally {
    release();
  }
});

test('renders both variable weights in WebKit', async ({ baseURL }) => {
  test.skip(!existsSync(webkit.executablePath()), 'Playwright WebKit is not installed');
  const browser = await webkit.launch();
  try {
    const page = await browser.newPage({ baseURL, viewport: { width: 960, height: 580 } });
    await page.goto(gameUrl);
    await variableWeights(page);
  } finally {
    await browser.close();
  }
});
