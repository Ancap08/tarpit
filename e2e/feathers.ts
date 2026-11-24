import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { FEATHERS } from '../src/sim/feathers';
import { mapPress } from './campaign';
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
        enemySprites: { views: Map<number, { sprite: { angle: number }; plumage?: { visible: boolean } }> };
      };
      const runner = s.enemies.find(e => e.id === front)!;
      return { before, after: t.animState(front)!.facing, hits: cast.ok ? cast.hits : 0, barrelFeathered,
        active: (runner.runTicksLeft ?? 0) === ticks - 1, gotBack: runner.distance < turn,
        plumage: view.enemySprites.views.get(front)?.plumage?.visible,
        flinching: (s.enemies.find(e => e.id === back)?.flinchTicksLeft ?? 0) > 0,
        angle: view.enemySprites.views.get(back)?.sprite.angle,
        showpiece: !!t.showpiece?.(), painted: t.painted().active };
    }, FEATHERS.runTicks);
    expect(frame).toMatchObject({ before: phone ? 'down' : 'right', after: phone ? 'up' : 'left',
      hits: 2, barrelFeathered: false, active: true, gotBack: true, plumage: true, flinching: true,
      showpiece: look === 'showpiece', painted: look !== 'classic' });
    expect(Math.abs(frame.angle!)).toBeGreaterThan(0);
    const canvas = page.locator('canvas').first();
    expect(await canvas.screenshot()).toEqual(await canvas.screenshot());
  });
}

export function featherLabels(phone: boolean) {
  test('the Feathers description fits its card with six percent wider text', async ({ page }) => {
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
    const text = 'Feathers tarred enemies. They run back.';
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
