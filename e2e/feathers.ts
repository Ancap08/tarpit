import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { FEATHERS } from '../src/sim/feathers';
import { SPECIAL_DEFS } from '../src/sim/specials';
import { mapPress, press } from './campaign';
import { useWideFontMetrics } from './campaignFont';
import { waitForTitle } from './title';

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
      // Two walkers on the horizontal section of Meadow, straddling the barrel rim.
      t.spawnHorde(2);
      s.enemies[0].distance = 364;
      s.enemies[1].distance = 364.25;
      t.step(0);
      const front = s.enemies[1].id, back = s.enemies[0].id;
      const before = t.animState(front)!.facing;
      const cast = t.useSpecialAt('tarBarrel', 220.125 + radius, 96);
      t.step(1);
      const view = t.game.scene.getScene('game') as unknown as {
        enemySprites: { views: Map<number, { sprite: { angle: number }; plumage?: { visible: boolean } }> };
      };
      const runner = s.enemies.find(e => e.id === front)!;
      return { before, after: t.animState(front)!.facing, casts: cast.ok ? cast.hits : 0,
        active: (runner.runTicksLeft ?? 0) === ticks - 1, gotBack: runner.distance < 364.25,
        plumage: view.enemySprites.views.get(front)?.plumage?.visible,
        flinching: (s.enemies.find(e => e.id === back)?.flinchTicksLeft ?? 0) > 0,
        angle: view.enemySprites.views.get(back)?.sprite.angle,
        showpiece: !!t.showpiece?.(), painted: t.painted().active };
    }, { radius: SPECIAL_DEFS.tarBarrel.radius, ticks: FEATHERS.runTicks });
    expect(frame).toMatchObject({ before: phone ? 'down' : 'right', after: phone ? 'up' : 'left',
      casts: 1, active: true, gotBack: true, plumage: true, flinching: true,
      showpiece: look === 'showpiece', painted: look !== 'classic' });
    expect(Math.abs(frame.angle!)).toBeGreaterThan(0);
    const canvas = page.locator('canvas').first();
    expect(await canvas.screenshot()).toEqual(await canvas.screenshot());
  });
}

export function featherLabels(phone: boolean) {
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
