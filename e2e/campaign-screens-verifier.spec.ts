import { expect, test, type Page } from '@playwright/test';
import type { CampaignProgress } from '../src/sim';
import { api, press } from './campaign';
import { useTallFontMetrics } from './campaignFont';
import { onScreen, rotate } from './campaignScreens';
import { waitForFirstScreen } from './title';
import { NEW_PHONE_HEIGHTS, newInterfaceChecks } from './newInterface';

// Milestone 48c verifier: cases that pin what the verifier found. Each real-time
// case has its own limit, sized for a CI runner about four times slower than the Mac.

const won = (n: number): CampaignProgress => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 2]));

const starRows = (page: Page) => api(page, t => t.game.scene.getScene(t.scene()).children.list
  .filter(node => node.name === 'campaignStars')
  .map(node => ((node as Phaser.GameObjects.Container).list as Phaser.GameObjects.Star[])
    .map(star => ({ points: star.points, filled: star.isFilled }))));

function checkCardsAndResults(modern = false) {
  for (const { id, stars, lives, points } of [
    { id: 1, stars: 3, lives: 20, points: 5 },
    { id: 11, stars: 1, lives: 1, points: 4 },
    { id: 11, stars: 3, lives: 16, points: 4 },
  ] as const) {
    test(`map, card and result draw the same ${stars} earned stars at level ${id}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/?test=1');
      await waitForFirstScreen(page);
      await page.evaluate(progress => window.__tarpit!.setCampaignProgress!(progress), { ...won(id - 1), [id]: stars });
      await press(page, 'title:campaign');
      await onScreen(page, 'levelMap');
      const row = [5, 5, points].map((points, i) => ({ points, filled: i < stars }));
      // Levels 1 and 11 are each the first plaque in their act.
      expect((await starRows(page))[0]).toEqual(row);
      await press(page, `title:stop:${id}`);
      await onScreen(page, 'levelCard');
      expect(await starRows(page)).toEqual([row]);
      await press(page, 'title:play');
      await onScreen(page, 'game');
      await page.evaluate(lives => {
        const t = window.__tarpit!;
        const s = t.state!();
        s.wave = s.level!.waves.length;
        s.lives = lives;
        s.phase = 'won';
        t.step!(0);
      }, lives);
      await onScreen(page, 'result');
      expect(await starRows(page)).toEqual([row]);
    });
  }

  test('a lost feat level shows the defeat without a feat verdict or star row', async ({ page }) => {
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await page.evaluate(() => window.__tarpit!.startLevel!(11));
    await onScreen(page, 'game');
    await page.evaluate(() => {
      const t = window.__tarpit!;
      const s = t.state!();
      s.lives = 0;
      s.phase = 'lost';
      t.step!(0);
    });
    await onScreen(page, 'result');
    const words = await api(page, t => t.campaignLabels().map(label => label.text));
    expect(words).toContain('Try again');
    expect(words.filter(line => /^(Earned:|Missed )/.test(line))).toEqual([]);
    expect(await starRows(page)).toEqual([]);
  });

  for (const height of modern ? NEW_PHONE_HEIGHTS : [844, 664]) {
    test(`the next-wave preview stays readable beside a tax line at 390x${height}`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 390, height });
      await page.goto('/?test=1');
      await waitForFirstScreen(page);
      await page.evaluate(() => window.__tarpit!.startLevel!(11));
      await onScreen(page, 'game');
      const css = await api(page, t => {
        const scene = t.game.scene.getScene('game');
        const scale = (t.canvasToPage(100, 0).x - t.canvasToPage(0, 0).x) / 100;
        const next = scene.children.list.find(n => n.type === 'Text' && (n as Phaser.GameObjects.Text).text.startsWith('Next:')) as Phaser.GameObjects.Text;
        return parseFloat(String(next.style.fontSize)) * Math.min(next.scaleX, next.scaleY) * scale;
      });
      expect(css).toBeGreaterThanOrEqual(height <= 664 ? 11.1 : 12);
    });
  }

  test('the flipped level card survives a layout switch with one scene running', async ({ page }) => {
    test.setTimeout(90_000);
    await useTallFontMetrics(page, true);
    await page.setViewportSize({ width: 390, height: 664 });
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await page.evaluate(progress => window.__tarpit!.setCampaignProgress!(progress), won(19));
    await press(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    await press(page, 'title:stop:20');
    await onScreen(page, 'levelCard');
    await press(page, 'title:cardPage');
    await onScreen(page, 'levelCard');
    const labels = () => api(page, t => t.campaignLabels().map(label => label.text));
    expect(await labels()).toContain('Notice');
    await rotate(page, 'levelCard');
    expect(await labels()).toContain('Notice');
    expect(await api(page, t => t.game.scene.getScenes(true).map(s => s.scene.key))).toEqual(['title']);
    // Play stays pressable from the back of the card.
    expect(await api(page, t => !!t.uiRects()['title:play'])).toBe(true);
  });

  test('Act Two stays shut with an explanation until level 10 is won, and Right crosses after', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?test=1');
    await waitForFirstScreen(page);
    await page.evaluate(progress => window.__tarpit!.setCampaignProgress!(progress), won(9));
    await press(page, 'title:campaign');
    await onScreen(page, 'levelMap');
    await press(page, 'title:act');
    expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain('Win level 10 first');
    expect(await api(page, t => t.levelStops!()[0].id)).toBe(1);
    await page.evaluate(progress => window.__tarpit!.setCampaignProgress!(progress), won(10));
    await page.waitForFunction(() => window.__tarpit!.levelStops!()[0]?.id === 1 && window.__tarpit!.titleReady());
    await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => window.__tarpit!.levelStops!()[0]?.id === 11 || window.__tarpit!.screen!() === 'secondAct');
    if (await api(page, t => t.screen()) === 'secondAct') await page.keyboard.press('Enter');
    await page.waitForFunction(() => window.__tarpit!.levelStops!()[0]?.id === 11);
  });
}

checkCardsAndResults();
newInterfaceChecks(() => checkCardsAndResults(true));
