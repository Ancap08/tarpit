import { expect, test, type Page } from '@playwright/test';
import { waitForGame, settle } from './painted';
import { waitForTitle } from './title';

async function ordinaryWave(page: Page, query: string) {
  await page.goto('/?test=1' + query);
  await waitForTitle(page);
  await page.evaluate(() => window.__tarpit!.startGame!('normal', 'meadow'));
  await waitForGame(page);
  await page.evaluate(() => {
    const api = window.__tarpit!;
    api.buildAt!(7, 5, 'musketeer');
    api.startWave!();
    api.step!(540);
  });
  await settle(page);
  return {
    state: await page.evaluate(() => JSON.stringify(window.__tarpit!.state!())),
    frame: await page.locator('canvas').screenshot(),
  };
}

test('the disabled keep switch preserves the ordinary wave, canvas and requests', async ({ page }) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', r => {
    const url = new URL(r.url());
    if (url.protocol === 'http:') requests.push(url.pathname);
  });
  const baseline = await ordinaryWave(page, '');
  const first = requests.splice(0).sort();
  const disabled = await ordinaryWave(page, '&keep=0');
  expect(disabled.state).toBe(baseline.state);
  expect(disabled.frame.equals(baseline.frame)).toBe(true);
  expect(requests.sort()).toEqual(first);
  expect(requests.filter(p => p.includes('/keep/'))).toEqual([]);
});

test('a cold install completes without fetching or caching the keep', async ({ page, context }) => {
  test.setTimeout(90_000);
  const keep: string[] = [];
  context.on('request', r => { if (new URL(r.url()).pathname.includes('/keep/')) keep.push(r.url()); });
  await page.goto('/');
  await waitForTitle(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  const cached = await page.evaluate(async () => {
    const urls = await Promise.all((await caches.keys()).map(async key =>
      (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)));
    return urls.flat();
  });
  expect(cached.some(url => url.endsWith('.js'))).toBe(true);
  expect(cached.filter(url => url.includes('/keep/'))).toEqual([]);
  expect(keep).toEqual([]);
});

test('the keep opens directly, stays frozen in test mode and awards no progress', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?keep=1&test=1');
  await waitForGame(page);
  await settle(page);
  const initial = await page.evaluate(() => ({
    lives: window.__tarpit!.state!().lives,
    storage: { ...localStorage },
  }));
  expect(initial.lives).toBe(20);
  const frame = await page.locator('canvas').screenshot();
  await settle(page);
  expect((await page.locator('canvas').screenshot()).equals(frame)).toBe(true);
  const result = await page.evaluate(() => {
    const a = window.__tarpit!;
    const s = a.state!();
    // Let every collector through in each fixed wave.
    for (let wave = 0; wave < 10 && s.phase === 'setup'; wave++) {
      a.startWave!();
      a.step!(18_000);
    }
    return {phase:s.phase,storage:{...localStorage}};
  });
  expect(['won','lost']).toContain(result.phase);
  expect(result.storage).toEqual(initial.storage);
});
