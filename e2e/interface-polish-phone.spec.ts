import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { INTER } from '../src/game/palette';
import { LEVEL_NAMES } from '../src/game/names';
import { api, press } from './campaign';
import { platformWideFactor, useWideFontMetrics } from './campaignFont';
import { newInterfacePhoneChecks } from './newInterface';
import { waitForFirstScreen } from './title';

newInterfacePhoneChecks(() => {
  for (const look of ['classic', 'painted', 'showpiece']) {
    test(`${look} draws cached terrain up to both edges without adding build cells`, async ({ page }) => {
      await page.goto('/?test=1&look=' + look);
      await waitForFirstScreen(page);
      await api(page, t => t.startGame('normal', 'meadow'));
      await press(page, 'bar:musketeer', true);
      const sample = await api(page, t => {
        const scene = t.game.scene.getScene('game') as GameScene;
        const { map, width } = scene['layout'];
        const image = scene.children.list.find(o =>
          o.type === 'Image' && (o as Phaser.GameObjects.Image).texture.key === 'clean:portrait-ground') as Phaser.GameObjects.Image;
        const bounds = image?.getBounds();
        if (!bounds) throw new Error('Portrait ground texture missing');
        const points = [map.x / 2, width - map.x / 2].map(x => t.canvasToPage(x, map.y + map.height / 2));
        return { left: bounds.left, right: bounds.right, width, points, gold: scene.state.gold,
          painted: t.painted().active, showpiece: !!t.showpiece?.() };
      });
      expect(sample.painted).toBe(look !== 'classic');
      expect(sample.showpiece).toBe(look === 'showpiece');
      expect(sample.left).toBeLessThanOrEqual(0);
      expect(sample.right).toBeGreaterThanOrEqual(sample.width);
      for (const { x, y } of sample.points) {
        await page.touchscreen.tap(x, y);
        await page.touchscreen.tap(x, y);
        expect(await api(page, t => ({ towers: t.state().towers.length, gold: t.state().gold })))
          .toEqual({ towers: 0, gold: sample.gold });
      }
    });
  }

  test('the long level name fits before Mute', async ({ page }) => {
    await useWideFontMetrics(page, platformWideFactor, INTER);
    await page.goto('/?test=1&look=painted');
    await waitForFirstScreen(page);
    await api(page, t => t.startLevel(5));
    const heading = await api(page, t => {
      const title = t.game.scene.getScene('game').children.getByName('hud-level-name') as Phaser.GameObjects.Text;
      return { text: title.text, visible: title.visible, clearance: t.uiRects().mute.x - title.getBounds().right };
    });
    expect(heading.text).toBe('Level 5 · ' + LEVEL_NAMES[5].name);
    expect(heading.visible).toBe(true);
    expect(heading.clearance).toBeGreaterThan(0);
  });
});
