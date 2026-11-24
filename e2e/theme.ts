import { expect, test, type Page } from '@playwright/test';
import { lastSpawnTick, LEVELS } from '../src/sim';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { Rect } from '../src/game/hud';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { bossBarGeometry } from '../src/game/ui/bossBar';
import { api, press } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { hudButtonLabelSuite } from './hudButtonLabels';
import { momentBannerSuite } from './momentBanners';
import { settle } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

function contained(a: Rect, area: Rect) {
  return a.x >= area.x && a.y >= area.y && a.x + a.width <= area.x + area.width && a.y + a.height <= area.y + area.height;
}

function overlap(a: Rect, b: Rect) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Compare the actual Phaser labels with their neighbours and active controls. */
async function checkLabels(page: Page, wanted: string[], area: Rect, controls?: RegExp) {
  const { labels, buttons } = await api(page, t => ({ labels: t.campaignLabels(), buttons: t.uiRects() }));
  for (const value of wanted) {
    const own = labels.find(label => label.text === value);
    expect(own, value).toBeDefined();
    expect(contained(own!, area), `${value} bounds ${JSON.stringify(own)} inside ${JSON.stringify(area)}`).toBe(true);
    const collisions = labels.filter(label => label !== own && overlap(own!, label)).map(label => label.text);
    expect(collisions, `text overlapping ${value}`).toEqual([]);
    const hits = Object.entries(buttons).filter(([key, rect]) => (!controls || controls.test(key)) && overlap(own!, rect));
    expect(hits.map(([key]) => key), `controls overlapping ${value}`).toEqual([]);
  }
}

export function themeSuite(touch: boolean) {
  momentBannerSuite(touch);
  hudButtonLabelSuite();
  for (const fallback of [false, true]) {
    test(`pause plaque and panel fit with tall metrics and wide digits (${fallback ? 'fallback' : 'Caslon'})`, async ({ page }) => {
      await useTallFontMetrics(page, fallback);
      await page.goto('/?test=1');
      await waitForFirstScreen(page);
      await api(page, t => t.startLevel(9));
      await api(page, t => {
        t.state().boons = ['longBarrels', 'stickyTar', 'stoneWalls'];
        t.state().wave = 6;
        t.state().gold = 99999;
        t.step(0);
      });
      const boxes = await api(page, t => t.uiRects());
      const labels = await api(page, t => t.campaignLabels());
      const pause = boxes.pause;
      const portrait = await api(page, t => t.layout() === 'portrait');
      const pauseLabels = labels.filter(label => overlap(label, pause));
      expect(pauseLabels.map(label => label.text)).toEqual(portrait ? [] : ['Pause']);
      if (!portrait) expect(contained(pauseLabels[0], pause)).toBe(true);
      await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(1);
      for (const [name, r] of Object.entries(boxes)) {
        if (name !== 'pause') expect(overlap(pause, r), name).toBe(false);
      }
      const start = labels.find(label => label.text === 'Start Wave')!;
      expect(contained(start, boxes.startWave)).toBe(true);
      await page.getByRole('button', { name: 'Pause', exact: true }).press('Enter');
      expect(await api(page, t => t.paused())).toBe(true);
      const map = await api(page, t => t.layout()) === 'portrait' ? PORTRAIT.map : LANDSCAPE.map;
      for (const restartLabel of ['Restart', 'Confirm restart']) {
        if (restartLabel === 'Confirm restart') await press(page, 'pause:restart', touch);
        const controls = await api(page, t => t.uiRects());
        const copy = await api(page, t => t.campaignLabels());
        const heading = copy.find(label => label.text === 'Paused')!;
        expect(contained(heading, map)).toBe(true);
        const rows = [['pause:resume', 'Resume'], ['pause:restart', restartLabel], ['pause:menu', 'Level map']];
        for (const [key, text] of rows) {
          const r = controls[key];
          expect(contained(r, map), key).toBe(true);
          expect(contained(copy.find(label => label.text === text)!, r), text).toBe(true);
          expect(overlap(r, heading), key).toBe(false);
          for (const [other] of rows) if (other !== key) expect(overlap(r, controls[other]), key).toBe(false);
        }
      }
    });
  }
  for (const tall of [false, true]) {
    test(`theme copy clears title controls, longest previews and both boss bars${tall ? ' (tall metrics)' : ''}`, async ({ page }, info) => {
      if (tall) await useTallFontMetrics(page);
      const phone = info.project.name === 'phone';
      const shot = async (name: string) => {
        if (tall || !process.env.M44A_REVIEW_DIR || info.project.name === 'tablet') return;
        await settle(page);
        await page.screenshot({ path: `${process.env.M44A_REVIEW_DIR}/${phone ? 'phone' : 'landscape'}-${name}.jpg`, quality: 88, scale: 'css' });
      };
      const url = '/?test=1&look=painted';
      await page.goto(url);
      await waitForFirstScreen(page);
      const canvas = { x: 0, y: 0, width: phone ? 480 : 960, height: phone ? 1194 : 580 };
      await checkLabels(page, ['Taxation is theft', 'The King wants your gold. Keep it.'], canvas);
      await checkLabels(page, ['TARPIT'], canvas);
      await shot('first');
      await waitForTitle(page);
      await checkLabels(page, ['Tarpit', 'a tower defense game', 'Difficulty', 'Map'], canvas);
      await page.goto(url);
      await waitForFirstScreen(page);
      await press(page, 'title:campaign', touch);
      await api(page, t => t.setCampaignProgress(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 3]))));
      await page.waitForFunction(() => window.__tarpit!.titleReady());
      await press(page, 'title:stop:9', touch);
      await page.waitForFunction(() => window.__tarpit!.titleReady() && window.__tarpit?.screen?.() === 'levelCard');
      expect(await api(page, t => t.campaignLabels().map(label => label.text).join(' '))).toContain("The King's Assessor");
      await shot('level-9-card');

      // Level 9's seventh wave has three troop types plus the Assessor.
      for (const campaign of [true, false]) {
        if (!campaign) {
          await page.goto(url);
          await waitForTitle(page);
        }
        await press(page, 'title:play', touch);
        await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
        const wave = campaign ? 7 : 20;
        await page.evaluate(wave => {
          const t = window.__tarpit as TarpitTestApi;
          t.state().wave = wave - 1;
          t.step(0);
        }, wave);
        const preview = campaign ? 'Next: 60 Harpy, 40 Redcoat, 13 Toll Troll + Grumblefoot'
          : 'Next: 8 Hound, 5 Redcoat, 8 Harpy, 6 Toll Troll + Grumblemaw';
        const hudRow = phone ? { x: 0, y: 0, width: 480, height: 76 } : { x: 0, y: 480, width: 960, height: 53 };
        const status = await api(page, t => t.hudText());
        await checkLabels(page, [status.gold, status.lives, status.wave, preview], hudRow, /^(special|startWave|speed|pause|mute|boon:)/);
        if (phone) {
          const cssSize = await api(page, t => {
            const scene = t.game.scene.getScene('game');
            const label = scene.children.list.find(child => child.type === 'Text' &&
              (child as Phaser.GameObjects.Text).text === t.hudText().next) as Phaser.GameObjects.Text;
            return Number.parseFloat(String(label.style.fontSize)) * label.scaleY / scene.scale.displayScale.y;
          });
          expect(cssSize).toBeGreaterThanOrEqual(14);
        }
        await shot(campaign ? 'level-9-preview' : 'free-play-wave-20');
        const spawn = lastSpawnTick(wave, campaign ? { level: LEVELS[8] } : undefined);
        await page.evaluate(spawn => {
          const t = window.__tarpit as TarpitTestApi;
          t.state().lives = 1000;
          t.startWave();
          // Advance past the arrival banner so the boss bar alone labels the encounter.
          t.step(spawn + 150);
        }, spawn);
        const bar = (await api(page, t => t.hudText())).boss;
        const name = campaign ? 'Assessor Grumblefoot' : 'King Grumblemaw';
        expect(bar).toMatch(new RegExp(`^${name} \\d+ / \\d+$`));
        const geometry = bossBarGeometry(phone ? PORTRAIT : LANDSCAPE);
        await checkLabels(page, [name], { ...geometry.bar, y: geometry.pill.y, height: geometry.pill.height });
        await checkLabels(page, [bar!.slice(name.length + 1)], geometry.bar);
        await shot(campaign ? 'assessor-boss-bar' : 'king-boss-bar');
      }
    });
  }
}
