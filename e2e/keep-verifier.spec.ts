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
  const saved = { 'tarpit.best': '{"v":1,"best":{"meadow":{"normal":2}}}' };
  await page.addInitScript(data => {
    for (const [key,value] of Object.entries(data)) localStorage.setItem(key,value);
  }, saved);
  await page.goto('/?keep=1&test=1');
  await waitForGame(page);
  await settle(page);
  const initial = await page.evaluate(() => ({
    lives: window.__tarpit!.state!().lives,
    storage: { ...localStorage },
  }));
  expect(initial.lives).toBe(20);
  expect(initial.storage).toEqual(saved);
  expect(await page.evaluate(() => window.__tarpit!.audio())).toMatchObject({enabled:false,context:'none',voices:0});
  const field = page.locator('#game');
  const frame = await field.screenshot();
  await settle(page);
  expect((await field.screenshot()).equals(frame)).toBe(true);
  const result = await page.evaluate(() => {
    const a = window.__tarpit!;
    const s = a.state!();
    a.setMuted(!a.audio().muted);
    for (const [col,row] of [[15,4],[22,7],[26,10],[22,10]]) {
      if (!a.buildAt!(col,row,'musketeer').ok) throw Error('Expected a legal marked site');
    }
    for (let wave = 0; wave < 10 && s.phase === 'setup'; wave++) {
      a.startWave!();
      a.step!(18_000);
    }
    return {phase:s.phase,storage:{...localStorage}};
  });
  expect(result.phase).toBe('won');
  expect(result.storage).toEqual(initial.storage);
});

test('pausing holds the opening and storm at the same instant', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?keep=1&perf=1&renderer=canvas');
  await waitForGame(page);
  await page.waitForFunction(() => (window.__tarpit?.keep?.()?.timeMs ?? 0) > 120);
  await page.keyboard.press('p');
  const pose = await page.evaluate(() => window.__tarpit!.keep?.());
  expect(pose!.opening).toBeGreaterThan(0);
  await settle(page);
  expect(await page.evaluate(() => window.__tarpit!.paused())).toBe(true);
  expect(await page.evaluate(() => window.__tarpit!.keep?.())).toEqual(pose);
  await page.keyboard.press('p');
  await page.waitForFunction(time => (window.__tarpit?.keep?.()?.timeMs ?? 0) > time, pose!.timeMs);
  expect(await page.evaluate(() => window.__tarpit!.keep?.()?.opening)).toBeGreaterThan(0);
});

test('a wall crew keeps its footing and dusk lighting when the phone turns', async ({page}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:390,height:664});
  await page.goto('/?keep=1&test=1');
  await waitForGame(page);
  const placed = await page.evaluate(() => {
    const api = window.__tarpit!;
    const {col,row} = api.state!().map.buildSites![0];
    return api.buildAt!(col,row,'cannon').ok;
  });
  expect(placed).toBe(true);
  const expectCrew = async () => {
    const crew = await page.evaluate(() => {
      const api = window.__tarpit!;
      const {col,row} = api.state!().towers[0].cell;
      const actual = api.painted!().sprites.find(s => s.visible && s.key.startsWith('keep:dusk:painted:cannon:'));
      const expected = api.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
      return {actual:actual && [actual.x,actual.y], expected:expected.boardLayout.cellCenter({col,row})};
    });
    expect(crew.actual).toEqual([crew.expected.x,crew.expected.y]);
  };
  await expectCrew();
  await page.setViewportSize({width:1024,height:768});
  await page.waitForFunction(() => window.__tarpit?.keep?.() && window.__tarpit.game.canvas.width === 960);
  await settle(page);
  await expectCrew();
});
