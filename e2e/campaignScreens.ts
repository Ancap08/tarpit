import { expect, test, type Page } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, press } from './campaign';
import { paintedAsset, settle } from './painted';
import { waitForFirstScreen } from './title';

type Screen = ReturnType<TarpitTestApi['screen']>;
const mixed = { 1: 3, 2: 1, 3: 2 } as const;

async function onScreen(page: Page, screen: Screen) {
  await page.waitForFunction((screen) => {
    const api = window.__tarpit as TarpitTestApi | undefined;
    return api?.screen() === screen && (api.scene() !== 'title' || api.titleReady());
  }, screen);
}

async function rotate(page: Page, screen: Screen) {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  await page.waitForFunction((layout) => window.__tarpit?.layout() === layout, height > width ? 'landscape' : 'portrait');
  await onScreen(page, screen);
}

async function finish(page: Page, win: boolean) {
  await page.evaluate((win) => {
    const t = window.__tarpit as TarpitTestApi;
    const state = t.state();
    state.wave = win ? state.level!.waves.length : 1;
    state.lives = win ? 12 : 0;
    state.phase = win ? 'won' : 'lost';
    t.step(0);
  }, win);
  await onScreen(page, 'result');
}

export function campaignScreenSuite(touch: boolean) {
  test('campaign trail, card, level, results and saved progress through real buttons', async ({ page }) => {
    const click = (key: string) => press(page, key, touch);
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await click('title:campaign');
    await onScreen(page, 'levelMap');
    await rotate(page, 'levelMap');
    await click('title:stop:2');
    await expect.poll(() => api(page, (t) => t.ui<TitleUiState>().lockedMessage)).toBe('Win level 1 first');
    expect(await api(page, (t) => t.screen())).toBe('levelMap');
    await click('title:stop:1');
    await onScreen(page, 'levelCard');
    await rotate(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(1);
    await click('title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state().level?.id)).toBe(1);
    await finish(page, true);
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 2, lives: 12, nextId: 2 });
    await click('nextLevel');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(2);
    await click('title:play');
    await onScreen(page, 'game');
    await finish(page, false);
    await click('menu');
    await onScreen(page, 'levelMap');
    expect(await api(page, (t) => t.levelStops().slice(0, 3))).toMatchObject([
      { id: 1, open: true, stars: 2 }, { id: 2, open: true, next: true }, { id: 3, open: false },
    ]);
    await page.evaluate((table) => (window.__tarpit as TarpitTestApi).setCampaignProgress(table), mixed);
    await onScreen(page, 'levelMap');
    expect(await api(page, (t) => t.levelStops().map(({ open, stars }) => [open, stars]))).toEqual([
      [true, 3], [true, 1], [true, 2], [true, 0], ...Array(6).fill([false, 0]),
    ]);
    await click('title:back');
    await waitForFirstScreen(page);
    await click('title:freePlay');
    await onScreen(page, 'freePlay');
    await click('title:hard');
    await click('title:map:riverbend');
    await click('title:play');
    await onScreen(page, 'game');
    expect(await api(page, (t) => t.state())).toMatchObject({ difficulty: 'hard', map: { id: 'riverbend' } });
  });

  test('Painted campaign level loads its art and falls back when a file fails', async ({ page }) => {
    for (const fallback of [false, true]) {
      let failureInjected = false;
      if (fallback) await page.route(paintedAsset, (route) => {
        if (failureInjected) return route.continue();
        failureInjected = true;
        return route.abort();
      });
      await page.goto('/?test=1&look=painted');
      await waitForFirstScreen(page);
      await press(page, 'title:campaign', touch);
      await onScreen(page, 'levelMap');
      await press(page, 'title:stop:1', touch);
      await onScreen(page, 'levelCard');
      await press(page, 'title:play', touch);
      await onScreen(page, 'game');
      expect(await api(page, (t) => t.painted().active)).toBe(!fallback);
      expect(failureInjected).toBe(fallback);
      expect(await api(page, (t) => t.state().level?.id)).toBe(1);
    }
  });
}

export function campaignScreenshotSuite(touch: boolean) {
  test('campaign screen screenshots', async ({ page }, info) => {
    const shot = async (name: string) => {
      await settle(page);
      if (process.env.CAMPAIGN_REVIEW_DIR) {
        await page.screenshot({
          path: `${process.env.CAMPAIGN_REVIEW_DIR}/${info.project.name === 'phone' ? 'phone' : 'landscape'}-${name}.jpg`,
          scale: 'css', quality: 85,
        });
      }
      await expect(page).toHaveScreenshot(`${name}.png`, { scale: 'css' });
    };
    const click = (key: string) => press(page, key, touch);
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await shot('first');
    await click('title:campaign');
    await onScreen(page, 'levelMap');
    await shot('map-fresh');
    await page.evaluate((table) => (window.__tarpit as TarpitTestApi).setCampaignProgress(table), mixed);
    await onScreen(page, 'levelMap');
    await shot('map-mixed');
    await click('title:stop:4');
    await onScreen(page, 'levelCard');
    await shot('card');
    await click('title:play');
    await onScreen(page, 'game');
    await finish(page, true);
    await shot('result-win');
    await click('playAgain');
    await onScreen(page, 'game');
    await finish(page, false);
    await shot('result-loss');
  });
}
