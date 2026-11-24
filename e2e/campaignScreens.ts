import { expect, test, type Page } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_STORY, levelTips, STORY_TEXT, TITLE_TEXT } from '../src/game/names';
import { api, press } from './campaign';
import { paintedAsset, settle } from './painted';
import { useTallFontMetrics } from './campaignFont';
import { waitForFirstScreen } from './title';

type Screen = ReturnType<TarpitTestApi['screen']>;
const mixed = { 1: 3, 2: 1, 3: 2 } as const;

export async function onScreen(page: Page, screen: Screen) {
  await page.waitForFunction((screen) => {
    const api = window.__tarpit as TarpitTestApi | undefined;
    return api?.screen() === screen && (api.scene() !== 'title' || api.titleReady());
  }, screen);
}

export async function rotate(page: Page, screen: Screen) {
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

/** Compare the Phaser text bounds and live hit targets in canvas coordinates. */
export async function checkSpacing(page: Page) {
  const items = await page.evaluate(({ buttons, actOne, actTwo }) => {
    const t = window.__tarpit as TarpitTestApi;
    const result = t.campaignResult();
    const labels = t.campaignLabels();
    const keys = result ? ['playAgain', 'menu', ...(result.nextId ? ['nextLevel'] : [])]
      : Object.keys(t.uiRects()).filter(key => key.startsWith('title:'));
    const boxes = keys.map(key => ({ key, owner: '', button: true, ...t.uiRects()[key] }));
    const owners = new Map(Object.entries(buttons));
    if (t.screen() === 'levelMap') owners.set(t.levelStops()[0].id === 1 ? actTwo : actOne, 'title:act');
    if (result) {
      const buttons = result.nextId ? ['nextLevel', 'playAgain', 'menu'] : ['playAgain', 'menu'];
      result.buttons.forEach((label, index) => owners.set(label, buttons[index]));
    }
    const expected = result ? [result.title, result.slots, result.story, result.actClose, ...result.details, ...result.buttons].filter(Boolean) : [];
    const texts = result ? expected.map(value => {
      const label = labels.find(node => node.text === value);
      if (!label) throw new Error(`Missing separate result line: ${value}`);
      return label;
    }) : labels;
    const starRow = /^[0-3] of 3 stars$/;
    if (t.screen() === 'levelMap' && labels.filter(label => starRow.test(label.text)).length !== t.levelStops().length) {
      throw new Error('Missing level-map star row');
    }
    if (t.screen() === 'levelCard' && !labels.some(label => starRow.test(label.text))) {
      throw new Error('Missing level-card star row');
    }
    let stop = '';
    for (const label of texts) {
      const { x, y, width, height } = label;
      let owner = /^Loading\n\d+%$/.test(label.text) ? 'title:play' : owners.get(label.text) ?? '';
      if (t.screen() === 'levelMap') {
        if (/^\d+$/.test(label.text)) stop = `title:stop:${label.text}`;
        if (starRow.test(label.text) || /^\d+$/.test(label.text)) owner = stop;
      }
      boxes.push({ key: label.text, owner, button: false, x, y, width, height });
    }
    if (result) {
      const picture = t.game.scene.getScene('game').children.list.find(o => o.name.startsWith('town-picture:')) as Phaser.GameObjects.Image;
      const { x, y, width, height } = picture.getBounds();
      boxes.push({ key: picture.name, owner: '', button: false, x, y, width, height });
    }
    const { width, height } = t.game.canvas;
    for (const box of boxes) {
      if (box.x < 0 || box.y < 0 || box.x + box.width > width || box.y + box.height > height)
        throw new Error(`Outside ${width}x${height}: ${box.key}`);
    }
    return boxes;
  }, { actOne: CAMPAIGN_TEXT.actOne, actTwo: CAMPAIGN_TEXT.actTwo, buttons: {
    [CAMPAIGN_TEXT.back]: 'title:back', [TITLE_TEXT.play]: 'title:play',
    [CAMPAIGN_TEXT.tips]: 'title:tips', [CAMPAIGN_TEXT.gotIt]: 'title:gotIt',
    [STORY_TEXT.continue]: 'title:continue', [CAMPAIGN_TEXT.notice]: 'title:cardPage',
    [CAMPAIGN_TEXT.mapNotes]: 'title:cardPage',
  } as Record<string, string> });
  expect(items.length).toBeGreaterThan(3);
  for (const [index, a] of items.entries()) {
    for (const b of items.slice(index + 1)) {
      if (a.button && b.owner === a.key) {
        expect(b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width &&
          b.y + b.height <= a.y + a.height, `${b.key} fits ${a.key}`).toBe(true);
        continue;
      }
      const gapX = Math.max(a.x - b.x - b.width, b.x - a.x - a.width);
      const gapY = Math.max(a.y - b.y - b.height, b.y - a.y - a.height);
      if (a.owner.startsWith('title:stop:') && a.owner === b.owner) {
        expect(b.y - a.y - a.height, `${a.key} to ${b.key} in ${a.owner}`).toBeGreaterThanOrEqual(4);
      }
      expect(Math.max(gapX, gapY), `${a.key} overlaps ${b.key}`).toBeGreaterThanOrEqual(0);
    }
  }
}

export function campaignScreenSuite(touch: boolean) {
  for (const tall of [false, true]) {
    test(`campaign labels and buttons have separate space${tall ? ' (tall metrics)' : ''}`, async ({ page }) => {
      test.setTimeout(120_000);
      if (tall) await useTallFontMetrics(page);
      await page.goto('/?test=1');
      await waitForFirstScreen(page, { showTips: true });
      await press(page, 'title:campaign', touch);
      await onScreen(page, 'levelMap');
      await press(page, 'title:stop:10', touch);
      await checkSpacing(page);
      await api(page, t => t.setCampaignProgress(Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 3]))));
      await onScreen(page, 'levelMap');
      await checkSpacing(page);
      for (let id = 1; id <= 10; id++) {
        await press(page, `title:stop:${id}`, touch);
        await onScreen(page, 'levelCard');
        expect(await api(page, t => t.campaignLabels().map(label => label.text))).toEqual(expect.arrayContaining([
          LEVEL_STORY[id].notice, LEVEL_NAMES[id].twist,
        ]));
        await checkSpacing(page);
        const play = await api(page, t => t.uiRects()['title:play']);
        await press(page, 'title:play', touch);
        await onScreen(page, 'levelTips');
        const gotIt = await api(page, t => t.uiRects()['title:gotIt']);
        expect(Math.max(play.x - gotIt.x - gotIt.width, gotIt.x - play.x - play.width,
          play.y - gotIt.y - gotIt.height, gotIt.y - play.y - play.height), 'Got it clears Play').toBeGreaterThanOrEqual(0);
        expect(await api(page, t => t.campaignLabels().map(label => label.text))).toEqual(expect.arrayContaining([...levelTips(id, touch)]));
        await checkSpacing(page);
        // Tablet and phone cover both touch layouts. Turn the desktop viewport for mouse wording.
        if (!touch) {
          await rotate(page, 'levelTips');
          await checkSpacing(page);
          expect(await api(page, t => t.campaignLabels().map(label => label.text))).toEqual(expect.arrayContaining([...levelTips(id, touch)]));
        }
        await page.keyboard.press('Escape');
        await onScreen(page, 'levelCard');
        if (!touch) await rotate(page, 'levelCard');
        await press(page, 'title:back', touch);
        await onScreen(page, 'levelMap');
      }
      for (const id of [1, 10]) {
        for (const lives of [0, 11, 12, 20]) {
          await page.evaluate(async ({ id, lives }) => {
            const t = window.__tarpit as TarpitTestApi;
            await t.startLevel(id);
            const state = t.state();
            state.wave = state.level!.waves.length;
            state.lives = lives;
            state.phase = lives ? 'won' : 'lost';
            t.step(0);
          }, { id, lives });
          await onScreen(page, 'result');
          await checkSpacing(page);
        }
      }
    });
  }

  for (const tall of [false, true]) {
    test(`the notices open once and remember where Continue leads${tall ? ' (tall metrics)' : ''}`, async ({ page }) => {
      test.setTimeout(75_000);
      if (tall) await useTallFontMetrics(page);
      const click = (key: string) => press(page, key, touch);
      const words = () => api(page, t => t.campaignLabels().map(label => label.text));
      const first = () => waitForFirstScreen(page, { showStory: true });
      await page.goto('/?test=1');
      await first();
      await click('title:campaign');
      await onScreen(page, 'opening');
      expect(await words()).toEqual(expect.arrayContaining([STORY_TEXT.openingNotice, STORY_TEXT.openingReply]));
      await checkSpacing(page);
      await click('title:continue');
      await onScreen(page, 'levelMap');
      await page.reload();
      await first();
      await click('title:campaign');
      await onScreen(page, 'levelMap');
      for (const id of [2, 7, 9, 10, 20]) {
        await page.evaluate(id => (window.__tarpit as TarpitTestApi).startLevel(id), id);
        await onScreen(page, 'game');
        await finish(page, true);
        expect(await words()).toContain(LEVEL_STORY[id].reply);
      }
      // Follow both result choices, including replay through a layout change.
      await click(tall ? 'playAgain' : 'menu');
      await onScreen(page, 'ending');
      expect(await words()).toContain(STORY_TEXT.ending);
      await checkSpacing(page);
      await rotate(page, 'ending');
      await checkSpacing(page);
      await click('title:continue');
      await onScreen(page, tall ? 'game' : 'levelMap');
      if (tall) expect(await api(page, t => t.state().level?.id)).toBe(20);
      await page.reload();
      await first();
      await api(page, t => t.startLevel(20));
      await onScreen(page, 'game');
      await finish(page, true);
      await click('menu');
      await onScreen(page, 'levelMap');
      await api(page, t => t.startLevel(20));
      await onScreen(page, 'game');
      await finish(page, false);
      expect(await words()).toContain(STORY_TEXT.loss);
    });
  }

  test('first visit shows tips, replay remembers them, and the card can show them again', async ({ page }, info) => {
    const click = (key: string) => press(page, key, touch);
    const card = async () => {
      await waitForFirstScreen(page, { showTips: true });
      await click('title:campaign');
      await onScreen(page, 'levelMap');
      await click('title:stop:1');
      await onScreen(page, 'levelCard');
    };
    const capture = async (id: number) => {
      if (process.env.M42_REVIEW_DIR && info.project.name !== 'tablet') {
        const layout = await api(page, t => t.layout());
        await settle(page);
        await page.screenshot({ path: `${process.env.M42_REVIEW_DIR}/${layout === 'portrait' ? 'phone' : 'landscape'}-tips-${id}.jpg`, quality: 85, scale: 'css' });
      }
    };
    await page.goto('/?test=1');
    await card();
    expect(await api(page, t => Object.keys(t.uiRects()))).not.toContain('title:tips');
    await click('title:play');
    await onScreen(page, 'levelTips');
    expect(await api(page, t => t.campaignLabels().map(l => l.text))).toContain(CAMPAIGN_TEXT.gotIt);
    await capture(1);
    await rotate(page, 'levelTips');
    await page.keyboard.press('Escape');
    await onScreen(page, 'levelCard');
    await page.keyboard.press('Space');
    await onScreen(page, 'levelTips');
    await click('title:gotIt');
    await onScreen(page, 'game');
    expect(await api(page, t => t.state().level?.id)).toBe(1);

    await page.reload();
    await card();
    await checkSpacing(page);
    await click('title:tips');
    await onScreen(page, 'levelTips');
    await rotate(page, 'levelTips');
    await page.keyboard.press('Enter');
    await onScreen(page, 'levelCard');
    await click('title:play');
    await onScreen(page, 'game');

    await finish(page, false);
    await click('menu');
    await onScreen(page, 'levelMap');
    await api(page, t => t.setCampaignProgress({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }));
    await onScreen(page, 'levelMap');
    await click('title:stop:7');
    await onScreen(page, 'levelCard');
    await click('title:play');
    await onScreen(page, 'levelTips');
    await capture(7);
    await page.keyboard.press('Space');
    await onScreen(page, 'game');
    expect(await api(page, t => t.state().level?.id)).toBe(7);
  });

  test('campaign trail, card, level, results and saved progress through real buttons', async ({ page }) => {
    const click = (key: string) => press(page, key, touch);
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await rotate(page, 'first');
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
    await rotate(page, 'game');
    expect(await api(page, (t) => t.state().level?.id)).toBe(1);
    await finish(page, true);
    await rotate(page, 'result');
    expect(await api(page, (t) => t.campaignResult())).toMatchObject({ stars: 2, lives: 12, nextId: 2 });
    await click('nextLevel');
    await onScreen(page, 'levelCard');
    expect(await api(page, (t) => t.ui<TitleUiState>().levelId)).toBe(2);
    await click('title:play');
    await onScreen(page, 'game');
    await finish(page, false);
    await rotate(page, 'result');
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
    await rotate(page, 'freePlay');
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
