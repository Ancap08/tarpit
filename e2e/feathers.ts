import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { FEATHERS } from '../src/sim/feathers';
import { BARREL_RECHARGE_TICKS, SPECIAL_DEFS } from '../src/sim/specials';
import { TICKS_PER_SECOND } from '../src/sim/time';
import { checkLabel } from './hudButtonLabels';
import { api, mapPress, press } from './campaign';
import { useWideFontMetrics } from './campaignFont';
import { checkSpacing, onScreen } from './campaignScreens';
import { waitForFirstScreen, waitForTitle } from './title';

async function start(page: Page, look: string) {
  await page.goto('/?test=1&look=' + look);
  await waitForTitle(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

export function featherLooks(look: string, phone: boolean) {
  test(look + ' shows the runner facing back, a stopped neighbour and a stable frozen frame', async ({ page }) => {
    await start(page, look);
    const frame = await page.evaluate(({ radius, ticks }) => {
      const t = window.__tarpit as TarpitTestApi;
      const s = t.state();
      s.wave = 3;
      t.startWave();
      s.spawnedPerGroup.fill(999);
      // Eight inside the rim, one just outside it. The closest runner passes that neighbour.
      t.spawnHorde(9);
      s.enemies[0].distance = 364;
      const crowd = s.enemies.slice(1);
      crowd.forEach((e, i) => { e.distance = 364.25 + 14 * i; });
      t.step(0);
      const front = crowd[0].id, back = s.enemies[0].id;
      const before = t.animState(front)!.facing;
      const cast = t.useSpecialAt('tarBarrel', 220.125 + radius, 96);
      t.step(1);
      const view = t.game.scene.getScene('game') as unknown as {
        featherPuffs: { bursts: unknown[] };
        enemySprites: { views: Map<number, { sprite: { angle: number }; plumage?: { visible: boolean }; trail?: unknown }> };
      };
      const runner = s.enemies.find(e => e.id === front)!;
      return { before, after: t.animState(front)!.facing, hits: cast.ok ? cast.hits : 0,
        marked: crowd.filter(e => view.enemySprites.views.get(e.id)?.plumage?.visible).length,
        active: (runner.runTicksLeft ?? 0) === ticks - 1, gotBack: runner.distance < 364.25,
        plumage: view.enemySprites.views.get(front)?.plumage?.visible,
        puffs: view.featherPuffs.bursts.length, trail: !!view.enemySprites.views.get(front)?.trail,
        flinching: (s.enemies.find(e => e.id === back)?.flinchTicksLeft ?? 0) > 0,
        angle: view.enemySprites.views.get(back)?.sprite.angle,
        showpiece: !!t.showpiece?.(), painted: t.painted().active };
    }, { radius: SPECIAL_DEFS.tarBarrel.radius, ticks: FEATHERS.barrelRunTicks });
    expect(frame).toMatchObject({ before: phone ? 'down' : 'right', after: phone ? 'up' : 'left',
      hits: 8, marked: 8, active: true, gotBack: true, plumage: true, puffs: 0, trail: false, flinching: true,
      showpiece: look === 'showpiece', painted: look !== 'classic' });
    expect(Math.abs(frame.angle!)).toBeGreaterThan(0);
    const canvas = page.locator('canvas').first();
    expect(await canvas.screenshot()).toEqual(await canvas.screenshot());
  });
}

export function featherLabels(phone: boolean) {
  test('C9: the Special button counts down the barrel’s longer refill', async ({ page }) => {
    await start(page, 'painted');
    const cast = await api(page, t => {
      t.state().wave = 3;
      t.startWave();
      return t.useSpecialAt('tarBarrel', 160, 96);
    });
    expect(cast.ok).toBe(true);
    const waitLabel = (ticks: number) => (phone ? '' : 'Wait ') + Math.ceil(ticks / TICKS_PER_SECOND) + 's';
    await checkLabel(page, 'special', waitLabel(BARREL_RECHARGE_TICKS));
    await page.evaluate(ticks => (window.__tarpit as TarpitTestApi).step(ticks), TICKS_PER_SECOND);
    await checkLabel(page, 'special', waitLabel(BARREL_RECHARGE_TICKS - TICKS_PER_SECOND));
    const phase = await api(page, t => {
      t.state().spawnedPerGroup.fill(999);
      t.state().enemies = [];
      t.step(1);
      return t.state().phase;
    });
    expect(phase).toBe('setup');
    const setupTicks = BARREL_RECHARGE_TICKS - TICKS_PER_SECOND - 1;
    await checkLabel(page, 'special', waitLabel(setupTicks));
    await page.evaluate(ticks => (window.__tarpit as TarpitTestApi).step(ticks), TICKS_PER_SECOND);
    await checkLabel(page, 'special', waitLabel(setupTicks));
    expect(await api(page, t => t.startWave().ok)).toBe(true);
    await page.evaluate(ticks => (window.__tarpit as TarpitTestApi).step(ticks), TICKS_PER_SECOND);
    await checkLabel(page, 'special', waitLabel(setupTicks - TICKS_PER_SECOND));
  });

  for (const [level, tip] of [
    [5, 'Drop a Tar Barrel on a crowd and they run back.'],
    [9, 'Feathers make tarred enemies run back. Bosses are too proud.'],
  ] as const) test(`the level ${level} feather tip fits with six percent wider text`, async ({ page }) => {
    await useWideFontMetrics(page);
    await page.goto('/?test=1');
    await waitForFirstScreen(page, { showTips: true });
    await api(page, t => t.setCampaignProgress(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, 3]))));
    await press(page, 'title:campaign', phone);
    await onScreen(page, 'levelMap');
    await press(page, `title:stop:${level}`, phone);
    await onScreen(page, 'levelCard');
    await press(page, 'title:play', phone);
    await onScreen(page, 'levelTips');
    expect(await api(page, t => t.campaignLabels().map(label => label.text)))
      .toContain(tip);
    await checkSpacing(page);
  });

  test('Feathers and Tar Barrel descriptions fit their controls with six percent wider text', async ({ page }) => {
    await useWideFontMetrics(page);
    await start(page, 'painted');
    await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = 500;
      t.buildAt(7, 5, 'tarpit');
      t.upgradeAt(7, 5);
      t.state().gold = 0;
    });
    await mapPress(page, 7, 5, phone);
    async function fits(key: string, text: string) {
      const label = await page.evaluate(({ key, text }) => {
        const t = window.__tarpit as TarpitTestApi;
        const box = t.uiRects()[key];
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
      }, { key, text });
      expect(label.inside, text).toBe(true);
      expect(label.overlaps, text).toEqual([]);
      expect(label.cssSize, text).toBeGreaterThan(11.1);
    }
    await fits('panel:path:B', 'Feathers tarred enemies. They run back.');
    await press(page, 'panel:close', phone);
    await page.evaluate(() => { const t = window.__tarpit as TarpitTestApi; t.state().wave = 6; t.startWave(); });
    await press(page, 'special', phone);
    await fits('special:tarBarrel', 'Tar and feathers. Enemies caught run back.');
  });
}
