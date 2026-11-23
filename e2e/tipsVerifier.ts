// Verifier (milestone 42): first-visit tips and the gold cheat in a real browser, shared by the three projects.
import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, press } from './campaign';
import { waitForFirstScreen } from './title';

type Screen = ReturnType<TarpitTestApi['screen']>;

async function onScreen(page: Page, screen: Screen) {
  await page.waitForFunction((screen) => {
    const t = window.__tarpit as TarpitTestApi | undefined;
    return t?.screen() === screen && (t.scene() !== 'title' || t.titleReady());
  }, screen);
}

/** Win or lose the running level by the simulation's own end rule, optionally after the gold cheat. */
const end = (page: Page, win: boolean, cheat = false, lives = 20) => page.evaluate(({ win, cheat, lives }) => {
  const t = window.__tarpit as TarpitTestApi;
  if (cheat) t.cheatGold();
  const state = t.state();
  state.wave = win ? state.level!.waves.length : 1;
  state.lives = win ? lives : 0;
  state.phase = win ? 'won' : 'lost';
  t.step(0);
}, { win, cheat, lives });

const stored = (page: Page, key: string) => page.evaluate((key) => localStorage.getItem(key), key);

async function rotateToPortrait(page: Page) {
  if (await api(page, (t) => t.layout()) === 'portrait') return;
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width: height, height: width });
  await page.waitForFunction(() => window.__tarpit?.layout() === 'portrait');
  await page.waitForFunction(() => { const t = window.__tarpit as TarpitTestApi; return t.scene() !== 'title' || t.titleReady(); });
}

export function tipsVerifierSuite(touch: boolean) {
  const tap = async (page: Page, x: number, y: number) => {
    if (touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };

  test('placing a tower takes one click with a mouse and two taps on touch (level 1 tip says click, tap twice)', async ({ page }) => {
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await api(page, (t) => t.startLevel(1));
    await onScreen(page, 'game');
    await press(page, 'bar:musketeer', touch);
    const at = await page.evaluate(() => window.__tarpit!.cellToPage(6, 7));
    await tap(page, at.x, at.y);
    expect(await api(page, (t) => t.state().towers.length)).toBe(touch ? 0 : 1);
    if (touch) {
      await tap(page, at.x, at.y);
      expect(await api(page, (t) => t.state().towers.length)).toBe(1);
    }
  });

  test('a quick second press on Play in portrait must not skip the first-visit tips', async ({ page }) => {
    // Pins a defect: in portrait the Got it button sits under the Play button, so a double press
    // starts the level and marks its tips as seen. Remove test.fail when fixed.
    test.fail();
    await page.goto('/?test=1');
    await waitForFirstScreen(page, { showTips: true });
    await rotateToPortrait(page);
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:1', touch);
    await onScreen(page, 'levelCard');
    const play = await page.evaluate(() => {
      const t = window.__tarpit!;
      const r = t.uiRects()['title:play'];
      return t.canvasToPage(r.x + r.width / 2, r.y + r.height / 2);
    });
    await tap(page, play.x, play.y);
    await page.waitForTimeout(100);
    await tap(page, play.x, play.y);
    await page.waitForTimeout(500);
    expect(await api(page, (t) => t.screen())).toBe('levelTips');
    expect(await stored(page, 'tarpit.seenTips')).toBeNull();
  });

  test('Escape on a first visit leaves the level unseen; the next level after a cheated win shows its own tips; Play again re-locks', async ({ page }) => {
    await page.goto('/?test=1');
    await waitForFirstScreen(page, { showTips: true });
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:1', touch);
    await onScreen(page, 'levelCard');
    await press(page, 'title:play', touch);
    await onScreen(page, 'levelTips');
    await page.keyboard.press('Escape');
    await onScreen(page, 'levelCard');
    expect(await stored(page, 'tarpit.seenTips')).toBeNull();
    await press(page, 'title:play', touch);
    await onScreen(page, 'levelTips');
    await press(page, 'title:gotIt', touch);
    await onScreen(page, 'game');
    expect(await stored(page, 'tarpit.seenTips')).toBe('[1]');

    await end(page, true, true);
    await onScreen(page, 'result');
    expect(await stored(page, 'tarpit.campaign')).toBe('{"v":2,"stars":{"1":0}}');
    expect(await api(page, (t) => t.campaignResult()?.nextId)).toBe(2);
    await press(page, 'nextLevel', touch);
    await onScreen(page, 'levelCard');
    await press(page, 'title:play', touch);
    await onScreen(page, 'levelTips');
    expect(await api(page, (t) => t.campaignLabels().map((l) => l.text))).toContain('Level 2 tips');
    await press(page, 'title:gotIt', touch);
    await onScreen(page, 'game');
    expect(await api(page, (t) => [t.state().level?.id, t.state().cheated])).toEqual([2, false]);

    // Level 1 again, cheat, then Play again: the cannon is locked again and the run is uncheated.
    await api(page, (t) => t.startLevel(1));
    await onScreen(page, 'game');
    await api(page, (t) => t.cheatGold());
    expect(await api(page, (t) => t.buildAt(8, 7, 'cannon').ok)).toBe(true);
    await end(page, false, false);
    await onScreen(page, 'result');
    await press(page, 'playAgain', touch);
    await onScreen(page, 'game');
    expect(await api(page, (t) => [t.state().cheated, t.state().towers.length])).toEqual([false, 0]);
    expect(await api(page, (t) => t.buildAt(8, 7, 'cannon').ok)).toBe(false);
  });

  test('an old version 1 save loads; a cheated win then an honest win; a cheated loss and a cheated replay change nothing', async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('tarpit.campaign', '{"v":1,"stars":{"1":3,"2":1}}');
        sessionStorage.setItem('seeded', '1');
      }
    });
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3, 2: 1 });
    await api(page, (t) => t.startLevel(3));
    await onScreen(page, 'game');
    await end(page, false, true);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3, 2: 1 });
    await press(page, 'playAgain', touch);
    await onScreen(page, 'game');
    await end(page, true, true);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3, 2: 1, 3: 0 });
    await press(page, 'playAgain', touch);
    await onScreen(page, 'game');
    await end(page, true, false, 14);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3, 2: 1, 3: 2 });
    await press(page, 'playAgain', touch);
    await onScreen(page, 'game');
    await end(page, true, true);
    await onScreen(page, 'result');
    expect(await api(page, (t) => t.progress())).toEqual({ 1: 3, 2: 1, 3: 2 });
  });
}
