import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import { OWNER_TEXT, PAINTED_FALLBACK, PAUSE_TEXT, TITLE_TEXT, bestScoreText } from '../src/game/names';
import { CASLON } from '../src/game/palette';
import type { Rect } from '../src/game/input';
import { api, press } from './campaign';
import { platformWideFactor, useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { onScreen } from './campaignScreens';
import { NEW_PHONE_VIEWPORTS } from './newInterface';
import { waitForFirstScreen } from './title';

type PaperPane = 'title' | 'pause' | 'fallback' | 'result';
type Clearance = { key: string; text: string; px: number };

async function reportPaperClearance(info: TestInfo, detail: string, items: Clearance[]) {
  items.sort((a, b) => a.px - b.px);
  const closest = items[0];
  info.annotations.push({ type: 'Paper clearance', description: closest
    ? `${detail} · ${closest.text} (${closest.key}) · ${closest.px.toFixed(3)} CSS px` : `${detail} · no labelled controls` });
  await info.attach(`Paper clearances ${detail}`, { body: JSON.stringify(items), contentType: 'application/json' });
}

async function checkDomPaper(page: Page, info: TestInfo, name: string, pairs: [key: string, label: Locator, sheet: Locator][]) {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const items = await Promise.all(pairs.map(async ([key, label, sheet]) => {
    const outer = (await sheet.boundingBox())!;
    return label.evaluate((element, { key, outer, factor }) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bounds = range.getBoundingClientRect();
      const extra = (factor - 1) * bounds.width / 2;
      const px = Math.min(bounds.left - outer.x - extra, outer.x + outer.width - bounds.right - extra,
        bounds.top - outer.y, outer.y + outer.height - bounds.bottom) - 5;
      return { key, text: element.textContent!.trim(), px };
    }, { key, outer, factor: platformWideFactor });
  }));
  const { width, height } = page.viewportSize()!;
  const detail = `${width}×${height} ${name}`;
  await reportPaperClearance(info, detail, items);
  expect.soft(items.filter(item => item.px < 4), detail).toEqual([]);
}

async function checkPaper(page: Page, info: TestInfo, margin: boolean, pane: PaperPane = 'title', name?: string) {
  const { issues, closest, screen } = await page.evaluate(({ pane, margin }) => {
    const t = window.__tarpit!;
    const { x: sx, y: sy } = t.game.scale.displayScale;
    const { width, height } = t.game.scale;
    const rects = Object.entries(t.uiRects()).filter(([key]) => {
      if (pane === 'result') return ['nextLevel', 'playAgain', 'menu', 'keepGoing'].includes(key);
      return key.startsWith(pane === 'pause' ? 'pause:' : 'title:');
    });
    const depth = { title: 0, pause: 21, fallback: 4, result: 11 }[pane];
    const labels = (t.game.scene.getScene(pane === 'title' ? 'title' : 'game').children.list)
      .filter((node): node is Phaser.GameObjects.Text => node.type === 'Text')
      .filter(node => node.visible && node.text && (pane === 'title' || node.depth === depth));
    const problems: string[] = [];
    const clearances: Clearance[] = [];
    const fits = (a: { x: number; y: number; width: number; height: number }, b: typeof a, pad = 0) =>
      a.x >= b.x + pad - .03 && a.y >= b.y + pad - .03 &&
      a.x + a.width <= b.x + b.width - pad + .03 && a.y + a.height <= b.y + b.height - pad + .03;
    const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
      a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const viewport = { x: 0, y: 0, width, height };
    const measure = (key: string, control: Rect, text: string, box: Phaser.Geom.Rectangle) => {
      // Keep the existing five canvas-unit inset, then require four CSS pixels beyond it.
      const px = Math.min((box.left - control.x - 5) / sx, (control.x + control.width - box.right - 5) / sx,
        (box.top - control.y - 5) / sy, (control.y + control.height - box.bottom - 5) / sy);
      clearances.push({ key, text, px });
      if (margin ? px < 4 : !fits(box, control, 5)) problems.push(`${text} clears ${key} inset by ${px.toFixed(3)} CSS px`);
    };
    for (const [i, [key, box]] of rects.entries()) {
      if (!fits(box, viewport)) problems.push(`${key} outside canvas`);
      if (Math.min(box.width / sx, box.height / sy) < 44) problems.push(`${key} target too small`);
      for (const [other, compare] of rects.slice(i + 1)) if (overlap(box, compare)) problems.push(`${key} overlaps ${other}`);
    }
    for (const [i, label] of labels.entries()) {
      const { text } = label;
      const box = label.getBounds();
      const size = parseFloat(String(label.style.fontSize)) / sy;
      const chip = label.getData('paper-chip') as Rect | undefined;
      if (chip) measure('chip', { ...chip, x: label.x + chip.x, y: label.y + chip.y }, text, box);
      for (const [key, button] of rects) {
        if (overlap(box, button)) measure(key, button, text, box);
      }
      if (pane === 'result') continue;
      if (!fits(box, viewport, 5)) problems.push(`${text} outside print area`);
      if (size < 12) problems.push(`${text} at ${size.toFixed(2)} CSS px`);
      for (const other of labels.slice(i + 1)) if (overlap(box, other.getBounds())) problems.push(`${text} overlaps ${other.text}`);
    }
    for (const [key] of rects) {
      if (key !== 'title:mute' && !clearances.some(item => item.key === key)) problems.push(`${key} has no visible label`);
    }
    return { issues: problems, closest: clearances, screen: t.screen!() };
  }, { pane, margin });
  const { width, height } = page.viewportSize()!;
  const detail = `${width}×${height} ${name ?? (pane === 'title' ? screen : pane)}`;
  if (margin) await reportPaperClearance(info, detail, closest);
  expect.soft(issues, detail).toEqual([]);
}

for (const metrics of ['normal', 'fixed Caslon', 'fixed fallback', 'wide Caslon'] as const) {
  test(`paper pages have usable type and spacing with ${metrics}`, async ({ page, hasTouch }, info) => {
    test.setTimeout(150_000);
    if (metrics.startsWith('fixed')) await useTallFontMetrics(page, metrics === 'fixed fallback');
    if (metrics === 'wide Caslon') await useWideFontMetrics(page, platformWideFactor, CASLON);
    await page.addInitScript(() => {
      localStorage.setItem('tarpit.best', JSON.stringify({ v: 1, best: { switchback: { normal: Number.MAX_SAFE_INTEGER, hard: 7 } } }));
      localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
      localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct","siegeEnding"]');
      localStorage.setItem('tarpit.seenTips', '[1]');
    });
    const click = (key: string) => press(page, key, hasTouch);
    const check = (pane?: PaperPane, name?: string) => checkPaper(page, info, metrics === 'wide Caslon', pane, name);
    for (const viewport of info.project.name === 'phone' ? NEW_PHONE_VIEWPORTS : [page.viewportSize()!]) {
      await test.step(`${viewport.width}×${viewport.height}`, async () => {
        await page.setViewportSize(viewport);
        await page.goto('/?test=1&ui=new&owner=1');
        await waitForFirstScreen(page, { showTips: true });
        await check();

        await click('title:freePlay');
        await onScreen(page, 'freePlay');
        await click('title:map:switchback');
        const score = await api(page, t => t.ui<TitleUiState>().bestLine);
        if (metrics === 'normal') expect(score?.text).toBe(bestScoreText('switchback', 'normal', Number.MAX_SAFE_INTEGER));
        await check();
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
        await check('pause');
        await click('pause:restart');
        if (metrics === 'normal') expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(PAUSE_TEXT.confirm);
        await check('pause', 'Confirm restart');
        await click('pause:restart');
        await onScreen(page, 'game');
        await page.waitForFunction(() => !window.__tarpit?.paused());
        await page.keyboard.press('p');
        await click('pause:menu');
        await onScreen(page, 'freePlay');
        await click('title:back');
        await onScreen(page, 'first');

        if (metrics === 'wide Caslon') {
          await page.goto('/?test=1&ui=new&owner=0&act3=1');
          await waitForFirstScreen(page);
          await click('title:campaign');
          await onScreen(page, 'levelMap');
          await check('title', 'Level map with locks');
          await page.goto('/?test=1&ui=new&owner=1');
          await waitForFirstScreen(page, { showTips: true });
        }
        await click('title:campaign');
        await onScreen(page, 'levelMap');
        for (const act of [1, 2, 3]) {
          await click(`title:act:${act}`);
          await onScreen(page, 'levelMap');
          await check('title', `Level map, Act ${act}`);
          if (metrics !== 'wide Caslon') continue;
          const stops = await api(page, t => t.levelStops().map(stop => stop.id));
          for (const id of stops) {
            await click(`title:stop:${id}`);
            await onScreen(page, 'levelCard');
            await check('title', `Level ${id} card`);
            if (await api(page, t => !!t.uiRects()['title:cardPage'])) {
              await click('title:cardPage');
              await onScreen(page, 'levelCard');
              await check('title', `Level ${id} Map notes`);
            }
            const replay = await api(page, t => !!t.uiRects()['title:tips']);
            await click(replay ? 'title:tips' : 'title:play');
            await onScreen(page, 'levelTips');
            await check('title', `Level ${id} tips`);
            if (replay) await page.keyboard.press('Escape');
            else await click('title:back');
            await onScreen(page, 'levelCard');
            await click('title:back');
            await onScreen(page, 'levelMap');
          }
        }
        await click('title:back');
        await onScreen(page, 'first');

        await click('title:owner');
        await onScreen(page, 'owner');
        await check();
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
          await check('title', key);
          await click(`title:${button}`);
          await onScreen(page, 'owner');
        }

        if (metrics === 'wide Caslon') {
          for (const [id, phase] of [[1, 'won'], [1, 'lost'], [10, 'won'], [20, 'won'], [25, 'won'], [25, 'lost']] as const) {
            if (id === 25) {
              await page.goto('/?test=1&ui=new&keep=25');
              await onScreen(page, 'game');
              if (phase === 'won') {
                await page.keyboard.press('p');
                await check('pause', 'Campaign pause');
                await page.keyboard.press('p');
              }
            } else await page.evaluate(id => window.__tarpit!.startLevel!(id), id);
            await page.evaluate(({ id, phase }) => {
              const t = window.__tarpit!;
              const state = t.state!();
              if (state.level?.id !== id) throw new Error(`Level ${id} did not start`);
              Object.assign(state, { phase, wave: state.level.waves.length, lives: phase === 'won' ? 12 : 0 });
              t.step!(0);
            }, { id, phase });
            await onScreen(page, 'result');
            await check('result', `Level ${id} ${phase} result`);
          }
        }
      });
    }
  });
}

test('boot, Painted progress and fallback, and Keep failure keep their recovery routes on paper', async ({ page, hasTouch }, info) => {
  test.setTimeout(90_000);
  await useWideFontMetrics(page, platformWideFactor, CASLON);
  for (const viewport of info.project.name === 'phone' ? NEW_PHONE_VIEWPORTS : [page.viewportSize()!]) {
    await page.setViewportSize(viewport);
    let resume!: () => void;
    const boot = new Promise<void>(resolve => { resume = resolve; });
    const entry = /\/assets\/index[^/]*\.js$/;
    await page.route(entry, async route => {
      await boot;
      await route.continue();
    }, { times: 1 });
    await page.goto('/?test=1&ui=new', { waitUntil: 'commit' });
    await expect(page.locator('#loading')).toHaveText(TITLE_TEXT.loading);
    const loading = page.locator('#loading > span');
    await expect(loading).toHaveCSS('border-radius', '12px');
    await checkDomPaper(page, info, 'Boot loading', [['loading', loading, loading]]);
    resume();
    await waitForFirstScreen(page);

    let fail!: () => void;
    const painted = new Promise<void>(resolve => { fail = resolve; });
    const atlas = /\/assets\/painted\/musketeer-2x[^/]*\.webp$/;
    await page.route(atlas, async route => {
      await painted;
      await route.abort();
    });
    await press(page, 'title:freePlay', hasTouch);
    await onScreen(page, 'freePlay');
    await press(page, 'title:look:painted', hasTouch);
    await press(page, 'title:play', hasTouch);
    await page.waitForFunction(() => window.__tarpit?.ui?.<TitleUiState>().loading !== null);
    await checkPaper(page, info, true, 'title', 'Painted loading');
    fail();
    await onScreen(page, 'game');
    expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(PAINTED_FALLBACK);
    await checkPaper(page, info, true, 'fallback', 'Painted fallback');
    await page.unroute(atlas);

    let failKeep!: () => void;
    const keep = new Promise<void>(resolve => { failKeep = resolve; });
    const keepArt = /\/assets\/keep\/.+\.webp$/;
    await page.route(keepArt, async route => {
      await keep;
      await route.abort();
    });
    await page.goto('/?test=1&ui=new&keep=1');
    const keepSheet = page.locator('#keep-status > div');
    const status = keepSheet.locator('p');
    await expect(keepSheet).toBeVisible();
    await checkDomPaper(page, info, 'Keep loading', [['status', status, keepSheet]]);
    failKeep();
    const back = page.getByRole('button', { name: 'Back to title' });
    await expect(back).toBeFocused();
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await checkDomPaper(page, info, 'Keep failure', [['status', status, keepSheet], ['back', back, back]]);
    await back.click();
    await waitForFirstScreen(page);
    await page.unroute(keepArt);
  }
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
