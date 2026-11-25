import { expect, test, type Page } from '@playwright/test';
import { CAMPAIGN_TEXT, LEVEL_STORY, OWNER_TEXT, STORY_TEXT, featResultText, levelTips, lockedLevelText, tipsHeading } from '../src/game/names';
import { OWNER_MODE_KEY } from '../src/game/ownerMode';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { KEEP_LEVELS } from '../src/sim/keepLevels';
import { api, press } from './campaign';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

const campaignKey = 'tarpit.campaign';
const seen = {
  'tarpit.seenBroadsides': '["opening","secondAct","ending"]',
  'tarpit.seenSiegeBroadsides': '["thirdAct","siegeEnding"]',
  'tarpit.seenTips': '[16]',
  'tarpit.seenSiegeTips': '[22]',
};
const ids = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const level16 = Object.fromEntries(ids(1, 15).map(id => [id, 3]));
const rawSave = (page: Page) => page.evaluate(key => localStorage.getItem(key), campaignKey);
const labels = (page: Page) => api(page, t => t.campaignLabels().map(label => label.text));
const uiKeys = (page: Page) => api(page, t => Object.keys(t.uiRects()));

async function title(page: Page, query = '&owner=1') {
  await page.goto('/?test=1' + query);
  await waitForFirstScreen(page, { showTips: true, showStory: true });
}

async function seed(page: Page, stars = level16, records: Record<string, string> = seen) {
  // Only seed a fresh origin. Reopening the app must read the prior visit's saved state.
  await page.addInitScript(({ stars, records, campaignKey }) => {
    if (localStorage.getItem(campaignKey)) return;
    localStorage.setItem(campaignKey, JSON.stringify({ v: 2, stars }));
    for (const [key, value] of Object.entries(records)) localStorage.setItem(key, value);
  }, { stars, records, campaignKey });
}

async function openMap(page: Page, touch: boolean) {
  await press(page, 'title:campaign', touch);
  await onScreen(page, 'levelMap');
}

async function act(page: Page, n: number, touch: boolean) {
  await press(page, `title:act:${n}`, touch);
  await onScreen(page, 'levelMap');
}

async function openCard(page: Page, id: number, touch: boolean) {
  await press(page, `title:stop:${id}`, touch);
  await onScreen(page, 'levelCard');
  expect(await api(page, t => t.ui()), `card opened from stop ${id}`).toMatchObject({ levelId: id });
}

async function finish(page: Page, lives = 20) {
  await page.evaluate(lives => {
    const t = window.__tarpit as TarpitTestApi;
    const s = t.state();
    s.wave = s.level!.waves.length;
    s.lives = lives;
    s.phase = 'won';
    t.step(0);
  }, lives);
  await onScreen(page, 'result');
}

async function capture(page: Page, name: string) {
  if (process.env.M53_REVIEW && test.info().project.name === 'phone') {
    await page.screenshot({ path: `docs/review/m53/390x844-${name}.png`, scale: 'css' });
  }
}

test('owner opens every map stop on the real controls without changing the save', async ({ page }, info) => {
  const touch = info.project.name !== 'chromium';
  await seed(page);
  await title(page);
  const before = await rawSave(page);
  expect(await labels(page)).toContain(OWNER_TEXT.mark);
  await capture(page, 'title');
  await openMap(page, touch);
  for (const [n, first, last] of [[1, 1, 10], [2, 11, 20], [3, 21, 25]]) {
    await test.step(`Act ${n}`, async () => {
      await act(page, n, touch);
      expect(await api(page, t => t.levelStops().map(({ id, open }) => [id, open])))
        .toEqual(ids(first, last).map(id => [id, true]));
      await capture(page, `act-${n}`);
      for (const id of ids(first, last)) {
        await openCard(page, id, touch);
        await press(page, 'title:back', touch);
        await onScreen(page, 'levelMap');
      }
    });
  }
  expect(await rawSave(page)).toBe(before);
});

test('owner wins keep stars and feats without qualifying as normal passes, even when the gap closes', async ({ page }, info) => {
  test.setTimeout(60_000);
  const touch = info.project.name !== 'chromium';
  await seed(page, level16, { ...seen, 'tarpit.seenTips': '[16,17,18,19,20]', 'tarpit.seenSiegeTips': '[21,22]' });
  await title(page);
  await openMap(page, touch);
  await act(page, 3, touch);
  await openCard(page, 22, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'game');
  await finish(page);
  expect(await api(page, t => t.campaignResult())).toMatchObject({ levelId: 22, stars: 3, nextId: 23,
    feat: featResultText(KEEP_LEVELS[1].feat!, true) });
  expect(JSON.parse((await rawSave(page))!)).toEqual({ v: 2, stars: level16, ownerStars: { 22: 3 } });

  await title(page, '');
  await openMap(page, touch);
  await act(page, 3, touch);
  expect(await api(page, t => t.levelStops().find(stop => stop.id === 22))).toMatchObject({ stars: 3, open: true });
  await title(page, '&owner=0');
  expect(await uiKeys(page)).not.toContain('title:owner');
  expect(await labels(page)).not.toContain(OWNER_TEXT.mark);
  expect(await page.evaluate(key => localStorage.getItem(key), OWNER_MODE_KEY)).toBeNull();
  await openMap(page, touch);
  expect(await api(page, t => t.levelStops().filter(stop => stop.open).map(stop => stop.id))).toEqual(ids(11, 16));
  expect((await uiKeys(page)).filter(key => key.startsWith('title:act'))).toEqual(['title:act']);
  expect(JSON.parse((await rawSave(page))!)).toEqual({ v: 2, stars: level16, ownerStars: { 22: 3 } });

  await title(page, '&act3=1');
  expect(await uiKeys(page)).not.toContain('title:owner');
  await openMap(page, touch);
  await press(page, 'title:act:3', touch);
  expect(await api(page, t => t.ui())).toMatchObject({ lockedMessage: lockedLevelText(20) });
  for (const id of ids(16, 21)) {
    if (id === 21) await act(page, 3, touch);
    await openCard(page, id, touch);
    await press(page, 'title:play', touch);
    await onScreen(page, 'game');
    await finish(page);
    expect(await api(page, t => t.campaignResult())).toMatchObject({ levelId: id, nextId: id + 1 });
    await press(page, 'menu', touch);
    await onScreen(page, 'levelMap');
  }
  expect(await api(page, t => t.levelStops().filter(stop => stop.open).map(stop => [stop.id, stop.stars, stop.next])))
    .toEqual([[21, 3, false], [22, 0, true]]);
  await openCard(page, 22, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'game');
  await finish(page, 1);
  expect(await api(page, t => t.campaignResult())).toMatchObject({ levelId: 22, stars: 1, nextId: 23 });
  await press(page, 'menu', touch);
  await onScreen(page, 'levelMap');
  expect(await api(page, t => t.levelStops().filter(stop => stop.open).map(stop => [stop.id, stop.stars, stop.next])))
    .toEqual([[21, 3, false], [22, 3, false], [23, 0, true]]);
  expect(JSON.parse((await rawSave(page))!)).toMatchObject({ stars: { 22: 1 }, ownerStars: { 22: 3 } });
});

test('owner wins on the next regular level leave that level as the next one to win', async ({ page }, info) => {
  const touch = info.project.name !== 'chromium';
  await seed(page);
  await title(page);
  await openMap(page, touch);
  await openCard(page, 16, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'game');
  await finish(page);
  expect(JSON.parse((await rawSave(page))!)).toEqual({ v: 2, stars: level16, ownerStars: { 16: 3 } });
  await title(page, '&owner=0');
  await openMap(page, touch);
  expect(await api(page, t => t.levelStops().filter(stop => stop.next || stop.id === 17).map(({ id, open, stars, next }) => ({ id, open, stars, next }))))
    .toEqual([{ id: 16, open: true, stars: 0, next: true }, { id: 17, open: false, stars: 0, next: false }]);
});

test('owner follows the manifest start URL through reload, a fresh offline launch and switch-off', async ({ page, context }) => {
  await page.goto('/?owner=1&renderer=canvas');
  await waitForFirstScreen(page, { showTips: true, showStory: true });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const manifest = await page.evaluate(async () => {
    const url = (document.querySelector('link[rel=manifest]') as HTMLLinkElement).href;
    const data = await (await fetch(url)).json();
    return { display: data.display, start: new URL(data.start_url, url).href };
  });
  expect(manifest.display).toBe('standalone');
  expect(new URL(manifest.start).search).toBe('');
  await page.goto(manifest.start);
  await page.reload();
  await waitForFirstScreen(page, { showTips: true, showStory: true });
  expect(await uiKeys(page)).toContain('title:owner');
  await page.close();
  await context.setOffline(true);
  const reopened = await context.newPage();
  await reopened.goto(manifest.start);
  await waitForFirstScreen(reopened, { showTips: true, showStory: true });
  expect(await uiKeys(reopened)).toContain('title:owner');
  expect(await reopened.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const touch = test.info().project.name !== 'chromium';
  await press(reopened, 'title:owner', touch);
  await reopened.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:owner:tips:25']);
  await reopened.goto(manifest.start + '?owner=0');
  await waitForFirstScreen(reopened, { showTips: true, showStory: true });
  expect(await uiKeys(reopened)).not.toContain('title:owner');
  await reopened.goto(manifest.start);
  await waitForFirstScreen(reopened, { showTips: true, showStory: true });
  expect(await uiKeys(reopened)).not.toContain('title:owner');
});

const stories = [
  ['opening', 'opening', [STORY_TEXT.openingNotice, STORY_TEXT.openingReply], 'continue'],
  ['secondAct', 'secondAct', [STORY_TEXT.secondActNotice, STORY_TEXT.secondActReply], 'continue'],
  ['thirdAct', 'thirdAct', [STORY_TEXT.thirdActNotice, STORY_TEXT.thirdActReply], 'continue'],
  ['firstClose', 'ownerClose', [LEVEL_STORY[10].reply, STORY_TEXT.firstActClose], 'back'],
  ['ending', 'ending', [STORY_TEXT.ending], 'continue'],
  ['secondClose', 'ownerClose', [LEVEL_STORY[20].reply, STORY_TEXT.secondActClose], 'back'],
  ['siegeEnding', 'siegeEnding', [STORY_TEXT.siegeEnding], 'continue'],
] as const;

const records = (page: Page) => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
  Object.keys(seen));

test('all seven story previews and all 25 tips buttons return to the owner page without altering records', async ({ page }, info) => {
  test.setTimeout(60_000);
  const touch = info.project.name !== 'chromium';
  // Preview both already-seen and unseen content so either kind of write is caught.
  const initial = { ...seen, 'tarpit.seenBroadsides': '["opening"]', 'tarpit.seenSiegeBroadsides': '[]' };
  await seed(page, level16, initial);
  await title(page);
  const before = await rawSave(page);
  await press(page, 'title:owner', touch);
  await onScreen(page, 'owner');
  await capture(page, 'owner');
  for (const [key, screen, copy, back] of stories) {
    await test.step(key, async () => {
      await press(page, `title:owner:${key}`, touch);
      await onScreen(page, screen);
      expect(await labels(page)).toEqual(expect.arrayContaining([...copy]));
      await press(page, `title:${back}`, touch);
      await onScreen(page, 'owner');
    });
  }
  for (const id of ids(1, 25)) {
    await test.step(`tips ${id}`, async () => {
      await press(page, `title:owner:tips:${id}`, touch);
      await onScreen(page, 'levelTips');
      expect(await labels(page)).toEqual([tipsHeading(id), ...levelTips(id, touch), CAMPAIGN_TEXT.gotIt]);
      await press(page, 'title:gotIt', touch);
      await onScreen(page, 'owner');
    });
  }
  await press(page, 'title:back', touch);
  await onScreen(page, 'first');
  expect(await records(page)).toEqual(initial);
  expect(await rawSave(page)).toBe(before);
});

test('session reset brings back normal story and tips, once per screen, without saving seen flags', async ({ page }, info) => {
  const touch = info.project.name !== 'chromium';
  await seed(page);
  await title(page);
  const before = await rawSave(page);
  await openMap(page, touch);
  await press(page, 'title:back', touch);
  await onScreen(page, 'first');
  await press(page, 'title:owner', touch);
  await onScreen(page, 'owner');
  await press(page, 'title:owner:reset', touch);
  expect(await records(page)).toEqual(seen);
  await press(page, 'title:back', touch);
  await onScreen(page, 'first');
  await press(page, 'title:campaign', touch);
  for (const screen of ['opening', 'secondAct'] as const) {
    await onScreen(page, screen);
    await press(page, 'title:continue', touch);
  }
  await onScreen(page, 'levelMap');
  await openCard(page, 16, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'levelTips');
  await press(page, 'title:gotIt', touch);
  await onScreen(page, 'game');
  await api(page, t => { t.state().phase = 'lost'; t.step(0); });
  await onScreen(page, 'result');
  await press(page, 'menu', touch);
  await onScreen(page, 'levelMap');
  await openCard(page, 16, touch);
  expect(await uiKeys(page)).toContain('title:tips');
  await press(page, 'title:back', touch);
  await onScreen(page, 'levelMap');
  await press(page, 'title:act:3', touch);
  await onScreen(page, 'thirdAct');
  await press(page, 'title:continue', touch);
  await onScreen(page, 'levelMap');
  await openCard(page, 22, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'levelTips');
  await press(page, 'title:back', touch);
  await onScreen(page, 'levelCard');
  await press(page, 'title:back', touch);
  await onScreen(page, 'levelMap');
  await openCard(page, 21, touch);
  await press(page, 'title:play', touch);
  await onScreen(page, 'levelTips');
  await press(page, 'title:gotIt', touch);
  await onScreen(page, 'game');
  expect(await records(page)).toEqual(seen);
  expect(await rawSave(page)).toBe(before);
  await page.reload();
  await waitForFirstScreen(page, { showTips: true, showStory: true });
  await openMap(page, touch);
  await openCard(page, 16, touch);
  expect(await uiKeys(page)).toContain('title:tips');
});

for (const font of ['normal', 'tall fallback', 'tall Caslon', 'wide'] as const) {
  test(`owner mark and page fit in ${font} font mode`, async ({ page }, info) => {
    if (font === 'tall fallback') await useTallFontMetrics(page);
    if (font === 'tall Caslon') await useTallFontMetrics(page, false);
    if (font === 'wide') await useWideFontMetrics(page);
    const viewports = info.project.name === 'phone' ? [{ width: 390, height: 664 }, { width: 390, height: 844 }] : [page.viewportSize()!];
    for (const { width, height } of viewports) {
      await test.step(`${width}x${height}`, async () => {
        await page.setViewportSize({ width, height });
        await title(page);
        const mark = { 'title:owner': OWNER_TEXT.mark };
        await checkFit(page, mark);
        await press(page, 'title:owner', info.project.name !== 'chromium');
        await onScreen(page, 'owner');
        expect(await labels(page)).toContain(OWNER_TEXT.title);
        await checkFit(page, {
          ...Object.fromEntries(stories.map(([key]) => [`title:owner:${key}`, OWNER_TEXT[key]])),
          ...Object.fromEntries(ids(1, 25).map(id => [`title:owner:tips:${id}`, String(id)])),
          'title:owner:reset': OWNER_TEXT.reset,
          'title:back': OWNER_TEXT.back,
        });
      });
    }
  });
}

async function checkFit(page: Page, controls: Record<string, string>) {
  const boxes = await page.evaluate(controls => {
    const t = window.__tarpit as TarpitTestApi;
    return {
      buttons: Object.entries(t.uiRects()).map(([key, r]) => {
        const tl = t.canvasToPage(r.x, r.y);
        const br = t.canvasToPage(r.x + r.width, r.y + r.height);
        return { ...r, key, tl, br, text: controls[key] };
      }),
      text: t.campaignLabels(),
    };
  }, controls);
  const overlapping = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  const { width, height } = page.viewportSize()!;
  for (const key of Object.keys(controls)) expect(boxes.buttons.map(button => button.key)).toContain(key);
  for (const [i, box] of boxes.buttons.entries()) {
    if (!box.text) continue;
    expect(box.tl.x, box.key).toBeGreaterThanOrEqual(0);
    expect(box.tl.y, box.key).toBeGreaterThanOrEqual(0);
    expect(box.br.x, box.key).toBeLessThanOrEqual(width);
    expect(box.br.y, box.key).toBeLessThanOrEqual(height);
    expect(box.br.x - box.tl.x, box.key).toBeGreaterThanOrEqual(44);
    expect(box.br.y - box.tl.y, box.key).toBeGreaterThanOrEqual(44);
    const label = boxes.text.find(label => label.text === box.text);
    expect(label, box.key).toBeDefined();
    expect(label!.x, box.key).toBeGreaterThanOrEqual(box.x + 4);
    expect(label!.x + label!.width, box.key).toBeLessThanOrEqual(box.x + box.width - 4);
    expect(label!.y, box.key).toBeGreaterThanOrEqual(box.y + 4);
    expect(label!.y + label!.height, box.key).toBeLessThanOrEqual(box.y + box.height - 4);
    for (const other of boxes.text.filter(text => text !== label)) {
      expect(overlapping(box, other), `${box.key} overlaps ${other.text}`).toBe(false);
    }
    for (const [j, other] of boxes.buttons.entries()) {
      if (i !== j) expect(overlapping(box, other), `${box.key} overlaps ${other.key}`).toBe(false);
    }
  }
}
