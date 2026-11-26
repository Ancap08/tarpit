import { expect, test, type Page } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import { OWNER_TEXT, PAINTED_FALLBACK, PAUSE_TEXT, TITLE_TEXT, bestScoreText } from '../src/game/names';
import { CASLON } from '../src/game/palette';
import { api, press } from './campaign';
import { platformWideFactor, useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { onScreen } from './campaignScreens';
import { NEW_PHONE_VIEWPORTS } from './newInterface';
import { waitForFirstScreen } from './title';

async function checkPaper(page: Page, pane: 'title' | 'pause' | 'fallback' = 'title') {
  const issues = await page.evaluate(pane => {
    const t = window.__tarpit!;
    const scale = t.canvasToPage(100, 100).x / 100 - t.canvasToPage(0, 0).x / 100;
    const { width, height } = t.game.scale;
    const rects = Object.entries(t.uiRects()).filter(([key]) => pane === 'pause' ? key.startsWith('pause:') : key.startsWith('title:'));
    const labels = (t.game.scene.getScene(pane === 'title' ? 'title' : 'game').children.list)
      .filter((node): node is Phaser.GameObjects.Text => node.type === 'Text')
      .filter(node => node.visible && node.text && (pane === 'title' || node.depth === (pane === 'pause' ? 21 : 4)))
      .map(node => ({ box: node.getBounds(), size: parseFloat(String(node.style.fontSize)), text: node.text }));
    const problems: string[] = [];
    const fits = (a: { x: number; y: number; width: number; height: number }, b: typeof a, pad = 0) =>
      a.x >= b.x + pad - .03 && a.y >= b.y + pad - .03 &&
      a.x + a.width <= b.x + b.width - pad + .03 && a.y + a.height <= b.y + b.height - pad + .03;
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const viewport = { x: 0, y: 0, width, height };
    for (const [i, [key, box]] of rects.entries()) {
      if (!fits(box, viewport)) problems.push(`${key} outside canvas`);
      if (Math.min(box.width, box.height) * scale < 44) problems.push(`${key} target too small`);
      for (const [other, compare] of rects.slice(i + 1)) if (overlap(box, compare)) problems.push(`${key} overlaps ${other}`);
    }
    for (const [i, { box, size, text }] of labels.entries()) {
      if (!fits(box, viewport, 5)) problems.push(`${text} outside print area`);
      if (size * scale < 12) problems.push(`${text} at ${(size * scale).toFixed(2)} CSS px`);
      for (const [key, button] of rects) {
        if (overlap(box, button) && !fits(box, button, 5)) problems.push(`${text} overlaps ${key} or its inset`);
      }
      for (const other of labels.slice(i + 1)) if (overlap(box, other.box)) problems.push(`${text} overlaps ${other.text}`);
    }
    return problems;
  }, pane);
  expect(issues).toEqual([]);
}

for (const metrics of ['normal', 'fixed Caslon', 'fixed fallback', 'wide Caslon'] as const) {
  test(`paper pages have usable type and spacing with ${metrics}`, async ({ page, hasTouch }, info) => {
    test.setTimeout(100_000);
    if (metrics.startsWith('fixed')) await useTallFontMetrics(page, metrics === 'fixed fallback');
    if (metrics === 'wide Caslon') await useWideFontMetrics(page, platformWideFactor, CASLON);
    await page.addInitScript(() => {
      localStorage.setItem('tarpit.best', JSON.stringify({ v: 1, best: { switchback: { normal: Number.MAX_SAFE_INTEGER, hard: 7 } } }));
      localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
      localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct","siegeEnding"]');
    });
    const click = (key: string) => press(page, key, hasTouch);
    for (const viewport of info.project.name === 'phone' ? NEW_PHONE_VIEWPORTS : [page.viewportSize()!]) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto('/?test=1&ui=new&owner=1');
        await waitForFirstScreen(page, { showTips: true });
        await checkPaper(page);

        await click('title:freePlay');
        await onScreen(page, 'freePlay');
        await click('title:map:switchback');
        const score = await api(page, t => t.ui<TitleUiState>().bestLine);
        if (metrics === 'normal') expect(score?.text).toBe(bestScoreText('switchback', 'normal', Number.MAX_SAFE_INTEGER));
        await checkPaper(page);
        await page.keyboard.press('ArrowRight');
        expect(await api(page, t => t.ui<TitleUiState>().difficulty)).toBe('hard');
        if (metrics === 'normal') expect(await api(page, t => t.ui<TitleUiState>().bestLine?.text)).toBe(bestScoreText('switchback', 'hard', 7));
        await click('title:look:painted');
        expect(await api(page, t => t.ui<TitleUiState>().look)).toBe('painted');
        await click('title:look:classic');
        await click('title:mute');
        expect(await api(page, t => t.audio().muted)).toBe(true);
        await click('title:mute');
        await click('title:play');
        await onScreen(page, 'game');
        await page.keyboard.press('p');
        await checkPaper(page, 'pause');
        await click('pause:restart');
        if (metrics === 'normal') expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(PAUSE_TEXT.confirm);
        await checkPaper(page, 'pause');
        await click('pause:restart');
        await onScreen(page, 'game');
        await page.waitForFunction(() => !window.__tarpit?.paused());
        await page.keyboard.press('p');
        await click('pause:menu');
        await onScreen(page, 'freePlay');
        await click('title:back');
        await onScreen(page, 'first');

        await click('title:campaign');
        await onScreen(page, 'levelMap');
        for (const act of [1, 2, 3]) {
          await click(`title:act:${act}`);
          await onScreen(page, 'levelMap');
          await checkPaper(page);
        }
        await click('title:back');
        await onScreen(page, 'first');

        await click('title:owner');
        await onScreen(page, 'owner');
        await checkPaper(page);
        if (metrics === 'normal') expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(OWNER_TEXT.title);
        for (const [key, screen, button] of [
          ['opening', 'opening', 'continue'],
          ['secondAct', 'secondAct', 'continue'],
          ['thirdAct', 'thirdAct', 'continue'],
          ['firstClose', 'ownerClose', 'back'],
          ['secondClose', 'ownerClose', 'back'],
          ['ending', 'ending', 'continue'],
          ['siegeEnding', 'siegeEnding', 'continue'],
          ['tips:25', 'levelTips', 'gotIt'],
        ] as const) {
          await click(`title:owner:${key}`);
          await onScreen(page, screen);
          await checkPaper(page);
          await click(`title:${button}`);
          await onScreen(page, 'owner');
        }
      });
    }
  });
}

test('boot, Painted progress and fallback, and Keep failure keep their recovery routes on paper', async ({ page, hasTouch }, info) => {
  test.setTimeout(60_000);
  if (info.project.name === 'phone') await page.setViewportSize(NEW_PHONE_VIEWPORTS[0]);
  let resume!: () => void;
  const boot = new Promise<void>(resolve => { resume = resolve; });
  await page.route(/\/assets\/index[^/]*\.js$/, async route => {
    await boot;
    await route.continue();
  });
  await page.goto('/?test=1&ui=new', { waitUntil: 'commit' });
  await expect(page.locator('#loading')).toHaveText(TITLE_TEXT.loading);
  await expect(page.locator('#loading > span')).toHaveCSS('border-radius', '12px');
  resume();
  await waitForFirstScreen(page);

  let fail!: () => void;
  const painted = new Promise<void>(resolve => { fail = resolve; });
  await page.route(/\/assets\/painted\/shared-[12]x[^/]*\.webp$/, async route => {
    await painted;
    await route.abort();
  });
  await press(page, 'title:freePlay', hasTouch);
  await onScreen(page, 'freePlay');
  await press(page, 'title:look:painted', hasTouch);
  await press(page, 'title:play', hasTouch);
  await page.waitForFunction(() => window.__tarpit?.ui?.<TitleUiState>().loading !== null);
  await checkPaper(page);
  fail();
  await onScreen(page, 'game');
  expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(PAINTED_FALLBACK);
  await checkPaper(page, 'fallback');

  await page.route(/\/assets\/keep\/.+\.webp$/, route => route.abort());
  await page.goto('/?test=1&ui=new&keep=1');
  const back = page.getByRole('button', { name: 'Back to title' });
  await expect(back).toBeFocused();
  expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await back.click();
  await waitForFirstScreen(page);
});

for (const mode of ['live', 'reduced', 'test'] as const) {
  test(`paper sheets move only when motion is enabled (${mode})`, async ({ page, hasTouch }) => {
    if (mode === 'reduced') await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (frames, options) {
        if (this.matches('canvas[data-interface-ink]')) {
          const count = Number(document.documentElement.dataset.sheetArrivals ?? '0');
          document.documentElement.dataset.sheetArrivals = String(count + 1);
        }
        return animate.call(this, frames, options);
      };
    });
    await page.goto('/?ui=new&renderer=canvas' + (mode === 'test' ? '&test=1' : ''));
    await waitForFirstScreen(page);
    const arrivals = () => page.locator('html').getAttribute('data-sheet-arrivals');
    expect(await arrivals()).toBe(mode === 'live' ? '1' : null);
    // Tap as soon as the title accepts input, including during live motion.
    await press(page, 'title:campaign', hasTouch);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:stop:1']);
    expect(await arrivals()).toBe(mode === 'live' ? '2' : null);
    await press(page, 'title:stop:1', hasTouch);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && !!window.__tarpit.uiRects()['title:play']);
  });
}
