import { expect, test } from '@playwright/test';
import { fingerFor, rectPage, tap, tapCell, touchDrag } from './phone';

test('all ten Old Keep sites accept a tower by touch on the phone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/?keep=1&test=1');
  await page.waitForFunction(() => window.__tarpit?.keep?.());
  const sites = await page.evaluate(() => {
    const state = window.__tarpit!.state!();
    state.gold = 1000;
    return state.map.buildSites!;
  });
  expect(sites).toHaveLength(10);
  await tap(page, 'wallSite');
  await tap(page, 'bar:musketeer');
  for (const [i, site] of sites.entries()) {
    await tapCell(page, site);
    await tapCell(page, site);
    expect(await page.evaluate(() => window.__tarpit!.state!().towers.length), JSON.stringify(site)).toBe(i + 1);
  }
  expect(await page.evaluate(() => window.__tarpit!.state!().towers.map(t => t.cell)))
    .toEqual(expect.arrayContaining([...sites]));
});

test('phone rotation releases the old plate images and textures before fetching the new set', async ({ page }) => {
  const requests: string[] = [];
  await page.route('**/assets/keep/*.webp', route => {
    requests.push(new URL(route.request().url()).pathname.split('/').at(-1)!);
    return route.continue();
  });
  await page.goto('/?keep=1&test=1');
  await page.waitForFunction(() => window.__tarpit?.keep?.());
  expect(requests.sort()).toEqual(['crown', 'drift', 'far', 'gate', 'glow', 'lightning', 'mist', 'plinth',
    'portrait', 'sky', 'wings'].map(name => name + '-half.webp').sort());
  // Keep a handle to the old HTML image and GPU texture to verify their actual disposal.
  const old = await page.evaluateHandle(() => {
    const glow = window.__tarpit!.game.textures.get('keep:glow');
    return {
      source: glow.getSourceImage() as HTMLImageElement,
      glow,
      layer: document.querySelector<HTMLCanvasElement>('#game [aria-hidden] canvas')!,
    };
  });
  const released = page.waitForRequest('**/assets/keep/landscape-half.webp').then(() =>
    old.evaluate(({ source, glow, layer }) =>
      !source.hasAttribute('src') && glow.source.length === 0 && !layer.isConnected && layer.width === 0));
  requests.length = 0;
  await page.setViewportSize({ width: 844, height: 390 });
  expect(await released).toBe(true);
  await page.waitForFunction(() => window.__tarpit?.keep?.() && window.__tarpit.game.canvas.width === 960);
  expect(requests.sort()).toEqual(['crown-wide', 'drift', 'far-wide', 'gate-wide', 'glow', 'landscape',
    'lightning-wide', 'mist', 'plinth', 'road-wide', 'sky'].map(name => name + '-half.webp').sort());
  await old.dispose();
});

test('the phone magnifier uses the cached Old Keep field during a drag', async ({ page, context }) => {
  await page.goto('/?keep=1&test=1');
  await page.waitForFunction(() => window.__tarpit?.keep?.());
  const site = await page.evaluate(() => window.__tarpit!.state!().map.buildSites![0]);
  const cdp = await context.newCDPSession(page);
  await touchDrag(page, cdp, await rectPage(page, 'bar:musketeer'), await fingerFor(page, site), async () => {
    expect(await page.evaluate(() => window.__tarpit!.ui!().magnifier)).toBeTruthy();
    expect(await page.evaluate(() => window.__tarpit!.game.textures.exists('keep:magnifier'))).toBe(true);
  });
  expect(await page.evaluate(() => window.__tarpit!.ui!().magnifier)).toBeNull();
  expect(await page.evaluate(() => window.__tarpit!.state!().towers[0]?.cell)).toEqual(site);
});
