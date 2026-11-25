import { expect, test, type Page } from '@playwright/test';
import { levelTips } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { FEATHERS } from '../src/sim/feathers';
import { BARREL_RECHARGE_TICKS, SPECIAL_RECHARGE_TICKS } from '../src/sim/specials';
import { TICKS_PER_SECOND } from '../src/sim/time';
import { api, mapPress, press, visibleTexts } from './campaign';
import { checkLabel } from './hudButtonLabels';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { checkSpacing, onScreen } from './campaignScreens';
import { waitForFirstScreen, waitForTitle } from './title';

async function start(page: Page, look: string) {
  await page.goto('/?test=1&look=' + look);
  await waitForTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function openTips(page: Page, level: number, touch: boolean) {
  await page.goto('/?test=1');
  await waitForFirstScreen(page, { showTips: true });
  await page.evaluate(id => window.__tarpit!.setCampaignProgress!(
    Object.fromEntries(Array.from({ length: id - 1 }, (_, i) => [i + 1, 3]))), level);
  await press(page, 'title:campaign', touch);
  await onScreen(page, 'levelMap');
  await press(page, 'title:stop:' + level, touch);
  await onScreen(page, 'levelCard');
  await press(page, 'title:play', touch);
  await onScreen(page, 'levelTips');
}

// Linux draws the bundled font about 2.6% wider than macOS before scaling.
const wideFactor = process.platform === 'darwin' ? 1.09 : 1.06;

export function featherLooks(look: string, phone: boolean) {
  test(look + ' shows the runner facing back, a stopped neighbour and a stable frozen frame', async ({ page }) => {
    await start(page, look);
    const frame = await page.evaluate(ticks => {
      const t = window.__tarpit as TarpitTestApi;
      const s = t.state();
      s.gold = 500;
      if (!t.buildAt(7, 4, 'tarpit').ok || !t.upgradeAt(7, 4).ok || !t.upgradeAt(7, 4, 'B').ok)
        throw new Error('Could not build Feathers on the bend');
      s.wave = 3;
      t.startWave();
      s.spawnedPerGroup.fill(999);
      // Two walkers on the horizontal section of Meadow, within range of the same pit.
      t.spawnHorde(2);
      s.enemies[0].distance = 364;
      s.enemies[1].distance = 364.25;
      t.step(0);
      const front = s.enemies[1].id, back = s.enemies[0].id;
      const before = t.animState(front)!.facing;
      const cast = t.useSpecialAt('tarBarrel', 220, 96);
      const barrelFeathered = s.enemies.some(e => e.feathered);
      t.step(1); // A real path B shot feathers the leading walker.
      const turn = s.enemies.find(e => e.id === front)!.distance;
      t.step(1); // The runner passes the other walker.
      const view = t.game.scene.getScene('game') as unknown as {
        featherPuffs: { bursts: unknown[] };
        enemySprites: { views: Map<number, { sprite: { angle: number }; plumage?: { visible: boolean }; trail?: unknown }> };
      };
      const runner = s.enemies.find(e => e.id === front)!;
      return { before, after: t.animState(front)!.facing, hits: cast.ok ? cast.hits : 0, barrelFeathered,
        active: (runner.runTicksLeft ?? 0) === ticks - 1, gotBack: runner.distance < turn,
        plumage: view.enemySprites.views.get(front)?.plumage?.visible,
        puffs: view.featherPuffs.bursts.length, trail: !!view.enemySprites.views.get(front)?.trail,
        flinching: (s.enemies.find(e => e.id === back)?.flinchTicksLeft ?? 0) > 0,
        angle: view.enemySprites.views.get(back)?.sprite.angle,
        showpiece: !!t.showpiece?.(), painted: t.painted().active };
    }, FEATHERS.runTicks);
    expect(frame).toMatchObject({ before: phone ? 'down' : 'right', after: phone ? 'up' : 'left',
      hits: 2, barrelFeathered: false, active: true, gotBack: true, plumage: true, puffs: 0, trail: false, flinching: true,
      showpiece: look === 'showpiece', painted: look !== 'classic' });
    expect(Math.abs(frame.angle!)).toBeGreaterThan(0);
    const canvas = page.locator('canvas').first();
    expect(await canvas.screenshot()).toEqual(await canvas.screenshot());
  });
}

export function featherLabels(phone: boolean) {
  for (const [level, tip] of [
    [5, 'Drop a Tar Barrel on a crowd to slow it down.'],
    [9, 'Feathers make tarred enemies run back. Bosses are too proud.'],
  ] as const) test(`the level ${level} feather tip fits with wider text`, async ({ page }) => {
    test.setTimeout(60_000);
    await useWideFontMetrics(page, wideFactor);
    await openTips(page, level, phone);
    expect(await api(page, t => t.campaignLabels().map(label => label.text))).toContain(tip);
    await checkSpacing(page);
  });

  test('the Feathers description fits its card with wider text', async ({ page }) => {
    await useWideFontMetrics(page, wideFactor);
    await start(page, 'painted');
    await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = 500;
      t.buildAt(7, 5, 'tarpit');
      t.upgradeAt(7, 5);
      t.state().gold = 0;
    });
    await mapPress(page, 7, 5, phone);
    const text = 'Tarred enemies run back.';
    const label = await page.evaluate(text => {
      const t = window.__tarpit as TarpitTestApi;
      const box = t.uiRects()['panel:path:B'];
      const visible = t.game.scene.getScene('game').children.list
        .filter(o => o.type === 'Text' && (o as Phaser.GameObjects.Text).visible) as Phaser.GameObjects.Text[];
      const line = visible.find(o => o.text === text)!;
      const b = line.getBounds();
      return {
        inside: b.left >= box.x && b.right <= box.x + box.width && b.top >= box.y && b.bottom <= box.y + box.height,
        overlaps: visible.filter(o => o !== line).filter(o => {
          const r = o.getBounds();
          return r.x < b.right && b.left < r.right && r.y < b.bottom && b.top < r.bottom;
        }).map(o => o.text),
        cssSize: parseFloat(String(line.style.fontSize)) * (t.canvasToPage(1, 0).x - t.canvasToPage(0, 0).x),
      };
    }, text);
    expect(label.inside, text).toBe(true);
    expect(label.overlaps, text).toEqual([]);
    expect(label.cssSize, text).toBeGreaterThan(11.1);
  });
}

export function featherBarrelLabels(touch: boolean, phone = false) {
  const heights = phone ? [664, 844] : [undefined];
  for (const height of heights) for (const metrics of ['normal', 'fixed Caslon', 'fixed fallback', 'wide']) {
    const layout = height ? `390x${height}, ` : '';
    test(`C9: the barrel description, tip and wait follow the level rule (${layout}${metrics})`, async ({ page }) => {
      test.setTimeout(90_000);
      if (height) await page.setViewportSize({ width: 390, height });
      if (metrics === 'wide') await useWideFontMetrics(page, wideFactor);
      if (metrics.startsWith('fixed')) await useTallFontMetrics(page, metrics === 'fixed fallback');
      await openTips(page, 11, touch);
      const [, castTip, waitTip] = levelTips(11, touch);
      const tips = await api(page, t => t.campaignLabels());
      const cast = tips.find(line => line.text === castTip)!;
      const delay = tips.find(line => line.text === waitTip)!;
      expect(delay.y).toBeGreaterThan(cast.y + cast.height);
      await checkSpacing(page);

      const seconds = Math.ceil(BARREL_RECHARGE_TICKS / TICKS_PER_SECOND);
      const caption = `Feathers a crowd. Next special in ${seconds}s.`;
      await start(page, 'painted');
      for (const id of [0, 5, 14]) {
        if (id) await page.evaluate(id => window.__tarpit!.startLevel!(id), id);
        await api(page, t => { if (!t.state().level) t.state().wave = 3; t.startWave(); });
        await press(page, 'special', touch);
        await checkLabel(page, 'special:tarBarrel', 'Tar Barrel');
        if (id === 14) {
          await checkLabel(page, 'special:tarBarrel', caption);
          const labels = await api(page, t => t.campaignLabels());
          const name = labels.find(line => line.text === 'Tar Barrel')!;
          expect(labels.find(line => line.text === caption)!.y).toBeGreaterThan(name.y + name.height);
        } else expect(await visibleTexts(page)).not.toContain(caption);
        await press(page, 'special:tarBarrel', touch);
        await mapPress(page, 1, 7, touch);
        const ticks = id === 14 ? BARREL_RECHARGE_TICKS : SPECIAL_RECHARGE_TICKS;
        const wait = (remaining: number) => (phone ? '' : 'Wait ') + Math.ceil(remaining / TICKS_PER_SECOND) + 's';
        await checkLabel(page, 'special', wait(ticks));
        await page.evaluate(n => window.__tarpit!.step!(n), TICKS_PER_SECOND);
        await checkLabel(page, 'special', wait(ticks - TICKS_PER_SECOND));
        if (id === 14) {
          expect(await api(page, t => {
            t.state().spawnedPerGroup.fill(999);
            t.state().enemies = [];
            t.step(1);
            return t.state().phase;
          })).toBe('setup');
          const remaining = ticks - TICKS_PER_SECOND - 1;
          await checkLabel(page, 'special', wait(remaining));
          await page.evaluate(n => window.__tarpit!.step!(n), TICKS_PER_SECOND);
          await checkLabel(page, 'special', wait(remaining));
          expect(await api(page, t => t.startWave().ok)).toBe(true);
          await page.evaluate(n => window.__tarpit!.step!(n), TICKS_PER_SECOND);
          await checkLabel(page, 'special', wait(remaining - TICKS_PER_SECOND));
        }
      }
    });
  }
}
