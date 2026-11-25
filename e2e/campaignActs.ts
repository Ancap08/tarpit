import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { LEVELS, type CampaignProgress } from '../src/sim';
import {
  CAMPAIGN_TEXT, LEVEL_NAMES, LEVEL_STORY, STORY_TEXT, cardFeatText, featResultText, levelTaxLines, levelTaxRows, levelFeatRow, levelTips, taxStatusText,
} from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, press } from './campaign';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { checkSpacing, onScreen, rotate } from './campaignScreens';
import { paintedAsset, settle } from './painted';
import { checkTaxLine } from './taxHud';
import { waitForFirstScreen } from './title';

const mixedStars = [0, 1, 2, 3] as const;
const progressThrough = (count: number): CampaignProgress =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [i + 1, mixedStars[i % mixedStars.length]]));
const words = (page: Page) => api(page, t => t.campaignLabels().map(label => label.text));
const seed = (page: Page, n: number) => page.evaluate(stars => window.__tarpit!.setCampaignProgress!(stars), progressThrough(n));

async function review(page: Page, info: TestInfo, name: string) {
  const dir = process.env.M48C_REVIEW_DIR;
  if (!dir || info.project.name === 'tablet') return;
  if (await api(page, t => t.screen()) === 'result') {
    await page.waitForFunction(() => window.__tarpit!.game.scene.getScene('game').children.list
      .some(o => o.name.startsWith('town-picture:') && (o as Phaser.GameObjects.Image).texture.key.startsWith('town-portrait-')));
  }
  await settle(page);
  await page.screenshot({ path: `${dir}/${info.project.name === 'phone' ? 'phone' : 'landscape'}-${name}.jpg`, scale: 'css', quality: 90 });
}

async function finish(page: Page, usedSpecial = false) {
  await page.evaluate(usedSpecial => {
    const t = window.__tarpit as TarpitTestApi;
    const state = t.state();
    // Place the run at its final clear. The normal win tick awards the stars and saves progress.
    state.wave = state.level!.waves.length - 1;
    state.lives = 16;
    if (!t.startWave().ok) throw new Error('Could not start the final wave');
    state.spawnedPerGroup = state.level!.waves[state.wave - 1].groups.map(group => group.count);
    if (usedSpecial && state.level!.allowedSpecials.includes('keg')) {
      const entry = state.map.path[0];
      if (!t.useSpecialAt('keg', entry.x, entry.y).ok) throw new Error('The special must count for this run');
    }
    t.step(1);
  }, usedSpecial);
  await onScreen(page, 'result');
}

async function readCard(page: Page, id: number) {
  await onScreen(page, 'levelCard');
  const level = LEVELS[id - 1];
  const modern = new URL(page.url()).searchParams.get('ui') === 'new';
  const copy = await words(page);
  const rules = modern
    ? [...levelTaxRows(level.taxes!).flatMap(({ title, description }) => [title, description]),
      ...Object.values(levelFeatRow(level.feat!)), CAMPAIGN_TEXT.thirdStar]
    : [CAMPAIGN_TEXT.inForce, ...levelTaxLines(level.taxes!), cardFeatText(level.feat!)];
  expect(copy).toEqual(expect.arrayContaining([LEVEL_STORY[id].notice, ...rules, CAMPAIGN_TEXT.bestStars]));
  if (modern) expect(copy).not.toContain(CAMPAIGN_TEXT.inForce);
  const answer = await api(page, t => {
    const node = t.game.scene.getScene('title').children.list.find(o => o.type === 'Text' &&
      (o as Phaser.GameObjects.Text).visible && (o as Phaser.GameObjects.Text).text === "Town's answer: Tar Barrels feather crowds.");
    if (!node) return null;
    const line = node as Phaser.GameObjects.Text;
    return { color: line.style.color, fontSize: line.style.fontSize, scale: Math.min(line.scaleX, line.scaleY),
      portrait: t.layout() === 'portrait' };
  });
  expect(answer, `C10: town's answer on level ${id}`).toMatchObject({
    color: modern ? '#234b40' : '#254a57',
    fontSize: answer?.portrait ? modern ? '23px' : '26px' : modern ? '17px' : '21px', scale: 1,
  });
  await checkSpacing(page);
}

/** Read the rendered font and hit target at the fitted scale, including Safari's shorter viewport. */
export async function checkSize(page: Page) {
  const issues = await api(page, t => {
    const scene = t.game.scene.getScene(t.scene());
    const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
    const result = t.campaignResult();
    const resultText = result && [result.title, result.story, result.actClose, ...result.details, ...result.buttons];
    const tooSmall: string[] = [];
    for (const node of scene.children.list) {
      if (node.type !== 'Text') continue;
      const label = node as Phaser.GameObjects.Text;
      if (!label.visible || !label.text || (resultText && !resultText.includes(label.text))) continue;
      const px = parseFloat(String(label.style.fontSize)) * Math.min(label.scaleX, label.scaleY) * scale;
      if (px < 12) tooSmall.push(`${label.text}: ${px.toFixed(1)}px`);
    }
    if (t.layout() === 'portrait') {
      for (const [key, r] of Object.entries(t.uiRects())) {
        if ((key.startsWith('title:') || ['nextLevel', 'playAgain', 'menu'].includes(key)) &&
          Math.min(r.width, r.height) * scale < 44) tooSmall.push(`${key} tap area`);
      }
    }
    return tooSmall;
  });
  expect(issues).toEqual([]);
}

export function campaignActSuite(touch: boolean, phone = false) {
  test('the two roads, first visit, feat awards and the last writ', async ({ page }, info) => {
    test.setTimeout(180_000);
    const click = (key: string) => press(page, key, touch);
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page, { showStory: true, showTips: true });
    await click('title:campaign');
    await onScreen(page, 'opening');
    await click('title:continue');
    await onScreen(page, 'levelMap');
    await review(page, info, 'act-one-fresh');
    await click('title:act');
    expect(await words(page)).toContain('Win level 10 first');
    expect(await api(page, t => t.levelStops().map(s => s.id))).toEqual(LEVELS.slice(0, 10).map(l => l.id));
    await checkSpacing(page);

    await seed(page, 9);
    await onScreen(page, 'levelMap');
    await review(page, info, 'act-one-mixed');
    await api(page, t => t.setTipsEnabled(false));
    await click('title:stop:10');
    await onScreen(page, 'levelCard');
    await click('title:play');
    await onScreen(page, 'game');
    await finish(page);
    expect(await words(page)).toEqual(expect.arrayContaining([LEVEL_STORY[10].reply, STORY_TEXT.firstActClose]));
    await checkSpacing(page);
    await review(page, info, 'level-10-close');
    await click('nextLevel');
    await onScreen(page, 'secondAct');
    expect(await words(page)).toEqual(expect.arrayContaining([STORY_TEXT.secondActNotice, STORY_TEXT.secondActReply]));
    await checkSpacing(page);
    await review(page, info, 'act-two-broadside');
    await rotate(page, 'secondAct');
    await checkSpacing(page);
    await rotate(page, 'secondAct');
    await page.keyboard.press('Enter');
    await readCard(page, 11);
    await click('title:back');
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops().filter(s => s.open).map(s => s.id))).toEqual([11]);
    const shapes = await api(page, t => t.game.scene.getScene('title').children.list
      .filter(node => node.name === 'campaignStars')
      .map(node => (node as Phaser.GameObjects.Container).list.map(star => (star as Phaser.GameObjects.Star).points)));
    expect(shapes).toEqual(Array(10).fill([5, 5, 4]));
    await review(page, info, 'act-two-fresh');
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:stop:10']);
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => !!window.__tarpit?.uiRects()['title:stop:11']);
    await rotate(page, 'levelMap');
    expect(await api(page, t => t.levelStops()[0].id)).toBe(11);
    await rotate(page, 'levelMap');
    await page.keyboard.press('Enter');
    await readCard(page, 11);
    await review(page, info, 'level-11-card');
    await rotate(page, 'levelCard');
    await readCard(page, 11);
    await rotate(page, 'levelCard');
    await api(page, t => t.setTipsEnabled(true));
    await click('title:play');
    await onScreen(page, 'levelTips');
    expect(await words(page)).toEqual(expect.arrayContaining([...levelTips(11, touch)]));
    await rotate(page, 'levelTips');
    await checkSpacing(page);
    await rotate(page, 'levelTips');
    await page.waitForFunction(() => window.__tarpit!.game.scene.getScene('title').input.enabled);
    await click('title:gotIt');
    await onScreen(page, 'game');
    await click('pause');
    expect(await api(page, t => t.paused())).toBe(true);
    await click('pause:resume');
    await finish(page);
    expect(await words(page)).toEqual(expect.arrayContaining([featResultText(LEVELS[10].feat!, true), LEVEL_STORY[11].reply, '3 of 3 stars']));
    await checkSpacing(page);
    await review(page, info, 'feat-earned');
    await rotate(page, 'result');
    await checkSpacing(page);
    await rotate(page, 'result');
    await click('playAgain');
    await onScreen(page, 'game');
    await finish(page, true);
    expect(await words(page)).toEqual(expect.arrayContaining([featResultText(LEVELS[10].feat!, false), '2 of 3 stars']));
    await review(page, info, 'feat-missed');
    await click('nextLevel');
    await readCard(page, 12);
    await api(page, t => t.setTipsEnabled(false));
    await click('title:play');
    await onScreen(page, 'game');
    expect(await api(page, t => t.cheatGold())).toMatchObject({ ok: true });
    await finish(page);
    expect(await api(page, t => t.campaignResult())).toMatchObject({ stars: 0, nextId: 13, feat: featResultText(LEVELS[11].feat!, false) });
    expect(await api(page, t => t.progress()[12])).toBe(0);
    await page.reload();
    await waitForFirstScreen(page, { showStory: true });
    await click('title:campaign');
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops().filter(s => s.next).map(s => s.id))).toEqual([13]);
    await review(page, info, 'act-two-mixed');
    await seed(page, 19);
    await onScreen(page, 'levelMap');
    for (const id of [16, 20]) {
      await click(`title:stop:${id}`);
      await readCard(page, id);
      await review(page, info, `level-${id}-card`);
      if (id !== 20) {
        await click('title:back');
        await onScreen(page, 'levelMap');
      }
    }
    await click('title:play');
    await onScreen(page, 'game');
    await finish(page);
    expect(await api(page, t => t.campaignResult())).toMatchObject({ levelId: 20, nextId: null, complete: 'Campaign complete!' });
    await click('menu');
    await onScreen(page, 'ending');
    expect(await words(page)).toContain(STORY_TEXT.ending);
    await review(page, info, 'level-20-ending');
    await rotate(page, 'ending');
    await checkSpacing(page);
    await click('title:continue');
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops().at(-1)?.id)).toBe(20);
  });

  test('a returning reader with the original ending sees the new notice and keeps the old ending receipt', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test=1');
    await waitForFirstScreen(page, { showStory: true });
    await page.evaluate(() => {
      localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 1, stars: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 2])) }));
      localStorage.setItem('tarpit.seenBroadsides', JSON.stringify(['opening', 'ending']));
    });
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'secondAct');
    await press(page, 'title:continue', touch);
    await onScreen(page, 'levelMap');
    expect(await api(page, t => t.levelStops()[0])).toMatchObject({ id: 11, open: true, next: true });
    await seed(page, 19);
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:20', touch);
    await onScreen(page, 'levelCard');
    await press(page, 'title:play', touch);
    await onScreen(page, 'game');
    await finish(page);
    await press(page, 'menu', touch);
    await onScreen(page, 'levelMap');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tarpit.seenBroadsides')!))).toEqual(
      expect.arrayContaining(['opening', 'secondAct', 'ending']));
  });

  test('painted loading progress fits the second-act Play button', async ({ page }) => {
    test.setTimeout(90_000);
    if (phone) await page.setViewportSize({ width: 390, height: 664 });
    await useTallFontMetrics(page);
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    await seed(page, 10);
    await press(page, 'title:campaign', touch);
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:11', touch);
    await onScreen(page, 'levelCard');
    let resume!: () => void;
    const gate = new Promise<void>(resolve => { resume = resolve; });
    await page.route(paintedAsset, async route => { await gate; await route.continue(); });
    try {
      const request = page.waitForRequest(paintedAsset);
      await press(page, 'title:play', touch);
      await request;
      const loading = (await words(page)).find(text => /^Loading\n\d+%$/.test(text));
      expect(loading).toBeDefined();
      await checkSpacing(page);
      await checkSize(page);
    } finally {
      resume();
    }
    await onScreen(page, 'game');
    expect(await api(page, t => t.painted().active)).toBe(true);
  });

  for (const height of phone ? [844, 664] : [0]) {
    if (height) test(`C10: every Act Two notice fits with wide text at 390x${height}`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: 390, height });
      await useWideFontMetrics(page, process.platform === 'darwin' ? 1.09 : 1.06);
      await page.goto('/?test=1');
      await waitForFirstScreen(page);
      await seed(page, 19);
      await press(page, 'title:campaign', touch);
      for (const level of LEVELS.slice(10)) {
        await onScreen(page, 'levelMap');
        await press(page, `title:stop:${level.id}`, touch);
        await readCard(page, level.id);
        await checkSize(page);
        await press(page, 'title:back', touch);
      }
    });
    for (const metrics of ['normal', 'fixed Caslon', 'fixed fallback']) {
      test(`act maps, notices, cards and results fit ${height || 'landscape'} with ${metrics}`, async ({ page }) => {
        test.setTimeout(180_000);
        if (height) await page.setViewportSize({ width: 390, height });
        if (metrics !== 'normal') await useTallFontMetrics(page, metrics === 'fixed fallback');
        await page.goto('/?test=1');
        await waitForFirstScreen(page, { showStory: true });
        await api(page, t => t.setTipsEnabled(true));
        await seed(page, 19);
        await page.evaluate(() => localStorage.setItem('tarpit.seenBroadsides', '["opening"]'));
        const click = (key: string) => press(page, key, touch);
        const inspect = async () => { await checkSpacing(page); await checkSize(page); };
        await click('title:campaign');
        await onScreen(page, 'secondAct');
        await inspect();
        await click('title:continue');
        await onScreen(page, 'levelMap');
        await inspect();
        await click('title:act');
        await onScreen(page, 'levelMap');
        await inspect();
        await click('title:act');
        await onScreen(page, 'levelMap');
        for (const level of LEVELS.slice(10)) {
          await click(`title:stop:${level.id}`);
          await readCard(page, level.id);
          await checkSize(page);
          if (await api(page, t => !!t.uiRects()['title:cardPage'])) {
            await click('title:cardPage');
            await onScreen(page, 'levelCard');
            expect(await words(page)).toContain(LEVEL_NAMES[level.id].twist);
            await inspect();
          }
          await click('title:play');
          await onScreen(page, 'levelTips');
          expect(await words(page)).toEqual(expect.arrayContaining([...levelTips(level.id, touch)]));
          await inspect();
          await page.keyboard.press('Escape');
          await onScreen(page, 'levelCard');
          await click('title:back');
          await onScreen(page, 'levelMap');
        }
        await api(page, t => t.startLevel(10));
        await finish(page);
        await inspect();
        for (const level of LEVELS.slice(10)) {
          for (const earned of [true, false]) {
            await page.evaluate(id => window.__tarpit!.startLevel!(id), level.id);
            if (earned) await checkTaxLine(page, taxStatusText(level.taxes, 0));
            await page.evaluate(earned => {
              const t = window.__tarpit!;
              const s = t.state!();
              const feat = s.level!.feat!;
              s.wave = s.level!.waves.length;
              s.lives = earned ? 20 : 16;
              s.leaks = earned ? 0 : 4;
              if (!earned && feat.kind === 'noSpecials') s.lastSpecialTick = s.tick;
              if (!earned && feat.kind === 'maxTowers') s.towersBuilt = feat.limit + 1;
              s.phase = 'won';
              t.step!(0);
            }, earned);
            await onScreen(page, 'result');
            expect(await words(page)).toContain(featResultText(level.feat!, earned));
            await inspect();
          }
        }
        await click('menu');
        await onScreen(page, 'ending');
        await inspect();
      });
    }
  }
}
