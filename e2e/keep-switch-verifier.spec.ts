// Independent checks of the hidden Old Keep switch (milestone 51 verifier).
// Gaps these close: the title and level map were never watched for keep
// requests; a lost plate, a loss, Play again and leaving to the title were
// never checked against saved data; Free play after a keep visit was not
// checked for leftovers.
import { expect, test, type Page } from '@playwright/test';
import { waitForGame } from './painted';

const SAVED = {
  'tarpit.best': '{"v":1,"best":{"meadow":{"normal":2}}}',
  'tarpit.campaign': '{"v":1,"stars":{"1":3,"2":1}}',
  'tarpit.look': 'painted',
  'tarpit.muted': '0',
  'tarpit.seenBroadsides': '["opening"]',
  'tarpit.seenTips': '["a"]',
};

async function seed(page: Page) {
  await page.addInitScript(data => {
    if (sessionStorage.getItem('seeded')) return;
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
    sessionStorage.setItem('seeded', '1');
  }, SAVED);
}

async function tapRect(page: Page, key: string) {
  const point = await page.evaluate(k => {
    const r = window.__tarpit!.uiRects()[k];
    return r ? window.__tarpit!.canvasToPage(r.x + r.width / 2, r.y + r.height / 2) : null;
  }, key);
  expect(point, 'button ' + key).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
}

const storage = (page: Page) => page.evaluate(() => JSON.stringify(Object.entries({ ...localStorage }).sort()));

test('title, level map, Free play and a campaign level never ask for a keep file', async ({ page }) => {
  test.setTimeout(120_000);
  const keep: string[] = [];
  page.on('request', r => { if (new URL(r.url()).pathname.includes('/keep/')) keep.push(r.url()); });
  await seed(page);
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:freePlay']);
  const before = await storage(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:campaign']);
  expect(await page.evaluate(() => document.documentElement.outerHTML.includes('keep=1'))).toBe(false);
  await tapRect(page, 'title:campaign');
  await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:continue'] || !!window.__tarpit!.uiRects()['title:stop:1']);
  if (await page.evaluate(() => !!window.__tarpit!.uiRects()['title:continue'])) await tapRect(page, 'title:continue');
  await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:stop:1']);
  expect(Object.keys(await page.evaluate(() => window.__tarpit!.uiRects())).filter(k => /keep/i.test(k))).toEqual([]);
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  await page.evaluate(() => window.__tarpit!.startLevel!(1));
  await waitForGame(page);
  expect(await page.evaluate(() => window.__tarpit!.state!().map.id)).toBe('meadow');
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  await page.evaluate(() => window.__tarpit!.startGame!('normal', 'riverbend'));
  await waitForGame(page);
  expect(keep).toEqual([]);
  expect(await storage(page)).toBe(before);
});

test('a plate that fails to load drops back to the ordinary title, not a broken level', async ({ browser }) => {
  test.setTimeout(90_000);
  // Page routes do not see requests made by the service worker, so block it.
  const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 960, height: 580 } });
  const page = await context.newPage();
  await page.route(/\/assets\/keep\/sky\.webp/, route => route.abort());
  await page.goto('/?keep=1');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:freePlay'], null, { timeout: 30_000 });
  expect(await page.evaluate(() => window.__tarpit!.game.scene.isActive('game'))).toBe(false);
  expect(await page.evaluate(() => document.querySelectorAll('div[aria-hidden=true]').length)).toBe(0);
  await context.close();
});

test('losing, Play again and leaving the keep change no saved data and leave Free play clean', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  await page.goto('/?keep=1&perf=1');
  await waitForGame(page);
  const before = await storage(page);
  const lose = async () => {
    await page.evaluate(() => {
      const s = window.__tarpit!.game.scene.getScene('game') as unknown as { state: { lives: number }; startWave(): void };
      s.startWave();
      s.state.lives = 0;
    });
    await page.waitForFunction(() => !!window.__tarpit!.uiRects()['playAgain'], null, { timeout: 30_000 });
  };
  await lose();
  await tapRect(page, 'playAgain');
  await page.waitForFunction(() => window.__tarpit!.keep !== undefined && (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { lives: number } }).state.lives === 20 && !window.__tarpit!.uiRects()['playAgain'], null, { timeout: 30_000 });
  expect(await page.evaluate(() => document.querySelectorAll('div[aria-hidden=true]').length)).toBe(1);
  await lose();
  await tapRect(page, 'menu');
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:freePlay'], null, { timeout: 30_000 });
  expect(await storage(page)).toBe(before);
  expect(await page.evaluate(() => document.querySelectorAll('div[aria-hidden=true]').length)).toBe(0);
  await tapRect(page, 'title:freePlay');
  await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:play']);
  await tapRect(page, 'title:play');
  await waitForGame(page);
  expect(await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { map: { id: string } } }).state.map.id)).toBe('meadow');
  expect(await page.evaluate(() => window.__tarpit!.keep?.() ?? null)).toBeNull();
  expect(await storage(page)).toBe(before);
});

test('with a saved campaign and ?keep=1 the keep opens, and every look switch still lands in it', async ({ page }) => {
  test.setTimeout(120_000);
  await seed(page);
  const before = (await (async () => { await page.goto('/'); await page.waitForFunction(() => window.__tarpit?.titleReady?.()); return storage(page); })());
  for (const query of ['?keep=1&look=classic', '?keep=1&look=showpiece', '?keep=1&perf=1&keepTier=0', '?keep=1&test=1']) {
    await page.goto('/' + query);
    await waitForGame(page);
    expect(await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { state: { map: { id: string } } }).state.map.id), query).toBe('keep');
    expect(await storage(page), query).toBe(before);
  }
});
