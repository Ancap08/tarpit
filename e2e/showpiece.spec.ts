import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { click, painted, settle, waitForGame } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

/** Include both page requests and requests made by the production worker. */
function observeExperiment(context: BrowserContext): string[] {
  const requested: string[] = [];
  context.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.includes('/assets/showpiece/')) requested.push(path);
  });
  return requested;
}

const textures = (page: Page) => page.evaluate(() => window.__tarpit!.game.textures.getTextureKeys());
const showpiece = (page: Page) => page.evaluate(() => window.__tarpit!.showpiece?.() ?? null);

for (const look of ['fresh', 'classic'] as const) {
  test(`cold install and a normal ${look} game never request showpiece code or art`, async ({ page, context }) => {
    test.setTimeout(90_000);
    const requests = observeExperiment(context);
    await page.goto(look === 'fresh' ? '/?renderer=canvas' : '/?renderer=canvas&look=classic');
    await waitForTitle(page);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 40_000 });
    await click(page, 'title:play');
    await waitForGame(page);
    await settle(page);
    const keys = await textures(page);
    expect(keys.includes('painted:meadow:1x')).toBe(look === 'fresh');
    expect(keys.filter(key => key.startsWith('showpiece:'))).toEqual([]);
    expect(requests).toEqual([]);
    const paths = await page.evaluate(async () => {
      const names = await caches.keys();
      const batches = await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(r => r.url)));
      return batches.flat();
    });
    expect(paths.some(url => /\/assets\/.*\.js$/.test(url))).toBe(true);
    expect(paths.filter(url => url.includes('/assets/showpiece/'))).toEqual([]);
  });
}

for (const level of [1, 2]) {
  test(`the campaign card for Meadow level ${level} starts its eligible look`, async ({ page, context }) => {
    const requests = observeExperiment(context);
    await page.goto('/?test=1&look=showpiece');
    await waitForFirstScreen(page);
    if (level === 2) await page.evaluate(() => window.__tarpit!.setCampaignProgress!({ 1: 3 }));
    await click(page, 'title:campaign');
    await page.waitForFunction(id => !!window.__tarpit?.uiRects()[`title:stop:${id}`], level);
    await click(page, `title:stop:${level}`);
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:play']);
    expect(requests).toEqual([]);
    await click(page, 'title:play');
    await waitForGame(page);
    expect(await page.evaluate(() => window.__tarpit!.state!().level?.id)).toBe(level);
    expect(await painted(page)).toMatchObject({ active: true });
    if (level === 1) {
      expect(await showpiece(page)).toMatchObject({ calm: true });
      expect(requests.filter(path => path.endsWith('.webp'))).toHaveLength(1);
    } else {
      expect(await showpiece(page)).toBeNull();
      expect(requests).toEqual([]);
    }
  });
}

test('Free play Riverbend uses Painted and offers only the standard looks', async ({ page, context }) => {
  const requests = observeExperiment(context);
  await page.goto('/?test=1&look=showpiece');
  await waitForTitle(page);
  const lookButtons = await page.evaluate(() => Object.keys(window.__tarpit!.uiRects()).filter(key => key.startsWith('title:look:')));
  expect(lookButtons.sort()).toEqual(['title:look:classic', 'title:look:painted']);
  await click(page, 'title:map:riverbend');
  await click(page, 'title:play');
  await waitForGame(page);
  expect(await page.evaluate(() => window.__tarpit!.state!().map.id)).toBe('riverbend');
  expect(await textures(page)).toContain('painted:riverbend:1x');
  expect(await showpiece(page)).toBeNull();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBeNull();
});

test('a broken showpiece atlas enters a playable Painted Meadow', async ({ page, context }) => {
  const requests = observeExperiment(context);
  await page.route('**/assets/showpiece/*.webp', route => route.fulfill({ status: 200, contentType: 'image/webp', body: 'broken' }));
  await page.goto('/?test=1&look=showpiece');
  await waitForTitle(page);
  await click(page, 'title:play');
  await waitForGame(page);
  expect(requests.filter(path => path.endsWith('.webp'))).toHaveLength(1);
  expect(await showpiece(page)).toBeNull();
  expect(await painted(page)).toMatchObject({ active: true });
  expect((await textures(page)).filter(key => key.startsWith('showpiece:'))).toEqual([]);
  expect(await page.evaluate(() => {
    const a = window.__tarpit!;
    a.startWave!();
    a.step!(60);
    return a.state!().enemies.length;
  })).toBeGreaterThan(0);
});

test('Free play Meadow holds the painted field and every new layer still and silent in test mode', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?test=1&look=showpiece');
  await waitForTitle(page);
  await page.evaluate(() => window.__tarpit!.setTipsEnabled!(false));
  await click(page, 'title:play');
  await waitForGame(page);
  expect(await showpiece(page)).toMatchObject({ calm: true, zoom: 1, timeMs: 0 });
  await page.evaluate(() => {
    const api = window.__tarpit!;
    api.startWave!();
    api.step!(90);
  });
  await settle(page);
  const canvas = page.locator('canvas').first();
  const first = await canvas.screenshot();
  await page.waitForTimeout(350);
  expect(await canvas.screenshot()).toEqual(first);
  const audio = await page.evaluate(() => window.__tarpit!.audio());
  expect(audio).toMatchObject({ enabled: false, context: 'none', voices: 0 });
  expect(await showpiece(page)).toMatchObject({ calm: true, zoom: 1, timeMs: 0 });
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBeNull();
});
