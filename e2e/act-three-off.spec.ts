import { expect, test } from '@playwright/test';
import { CAMPAIGN_END, STORY_TEXT } from '../src/game/names';
import type { GameScene } from '../src/game/GameScene';
import { press, visibleTexts } from './campaign';
import { waitForFirstScreen } from './title';

const save = {
  'tarpit.campaign': JSON.stringify({ v: 2, stars: Object.fromEntries(
    Array.from({ length: 25 }, (_, i) => [i + 1, i < 20 ? 3 : i % 3 + 1]),
  ) }),
  'tarpit.seenBroadsides': '["opening","secondAct"]',
  'tarpit.seenTips': '[20]',
  'tarpit.seenSiegeBroadsides': '["thirdAct","siegeEnding"]',
  'tarpit.seenSiegeTips': '[21,22,23,24,25]',
};
const privateFile = /\/assets\/(keep|act3)\//;
const stops = (first: number) => Array.from({ length: 10 }, (_, i) => 'title:stop:' + (i + first));

test('Act Three stays private across level 20 and service worker installation', async ({ page, context }, info) => {
  const touch = info.project.name !== 'chromium';
  const requests: string[] = [];
  const errors: string[] = [];
  context.on('request', request => {
    const { pathname } = new URL(request.url());
    if (privateFile.test(pathname)) requests.push(pathname);
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(data => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
  }, save);

  await page.goto('/?look=painted');
  await waitForFirstScreen(page, { showTips: true, showStory: true });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Repeat the title load under an installed worker as well as covering its install.
  await page.reload();
  await waitForFirstScreen(page, { showTips: true, showStory: true });
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  expect.soft(requests, 'private files requested by the title or worker').toEqual([]);

  const saved = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])),
    Object.keys(save));
  const keys = () => page.evaluate(() => Object.keys(window.__tarpit!.uiRects()));
  const levelStops = async () => (await keys()).filter(key => key.startsWith('title:stop:'));
  await press(page, 'title:campaign', touch);
  await expect.poll(levelStops).toEqual(stops(11));
  expect((await keys()).filter(key => key.startsWith('title:act'))).toEqual(['title:act']);
  await press(page, 'title:act', touch);
  await expect.poll(levelStops).toEqual(stops(1));
  expect((await keys()).filter(key => key.startsWith('title:act'))).toEqual(['title:act']);
  await press(page, 'title:act', touch);
  await expect.poll(levelStops).toEqual(stops(11));
  await press(page, 'title:stop:20', touch);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:play']);
  await press(page, 'title:play', touch);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && !!window.__tarpit.uiRects()['startWave']);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    scene.state.wave = scene.state.level!.waves.length;
    scene.state.phase = 'won';
    scene.redraw();
  });
  await expect.poll(() => page.evaluate(() =>
    (window.__tarpit!.game.scene.getScene('game') as GameScene).campaignResult(),
  )).toMatchObject({ complete: CAMPAIGN_END.complete, actClose: '', nextId: null });
  expect(await visibleTexts(page)).toContain(CAMPAIGN_END.complete);
  expect(await visibleTexts(page)).not.toContain(STORY_TEXT.secondActClose);
  expect(await keys()).not.toContain('nextLevel');
  expect(await saved()).toEqual(save);
  await press(page, 'menu', touch);
  await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:continue']);
  const ending = await page.evaluate(() =>
    window.__tarpit!.game.scene.getScene('title').children.list
      .filter(child => child.type === 'Text').map(child => (child as Phaser.GameObjects.Text).text),
  );
  expect(ending).toContain(STORY_TEXT.ending);
  expect(ending).not.toContain(STORY_TEXT.siegeEnding);
  await press(page, 'title:continue', touch);
  await expect.poll(levelStops).toEqual(stops(11));
  await press(page, 'title:back', touch);
  await waitForFirstScreen(page, { showTips: true, showStory: true });

  expect(await saved()).toEqual({ ...save, 'tarpit.seenBroadsides': '["opening","secondAct","ending"]' });
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async name =>
    (await (await caches.open(name)).keys()).map(request => new URL(request.url).pathname),
  ))).flat());
  expect(cached.length).toBeGreaterThan(0);
  expect(cached.filter(path => privateFile.test(path))).toEqual([]);
  expect(requests, 'private files requested through level 20 and back').toEqual([]);
  expect(errors).toEqual([]);
});
