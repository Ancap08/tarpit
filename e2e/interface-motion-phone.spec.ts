import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { api, mapPress, press } from './campaign';
import { waitForFirstScreen, waitForTitle } from './title';

test('the Clean panel and its range are still in frozen play', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?ui=new&test=1&look=classic');
  await waitForFirstScreen(page);
  await api(page, t => t.startGame());
  await api(page, t => t.buildAt(7, 5, 'musketeer'));
  await mapPress(page, 7, 5, true);
  const panel = () => page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return { progress: scene['panel'].arrival, rect: scene['panel'].rect };
  });
  const before = await panel();
  expect(before.progress).toBe(1);
  expect(before.rect).not.toBeNull();
  const screenshot = await page.screenshot();
  await page.evaluate(() => new Promise<void>(resolve => window.__tarpit!.game.events.once('postrender', resolve)));
  expect(await panel()).toEqual(before);
  expect(await page.screenshot()).toEqual(screenshot);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`a live tap upgrades immediately during panel arrival (${reducedMotion})`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion });
    await page.goto('/?ui=new&look=classic&renderer=canvas');
    await waitForTitle(page);
    await press(page, 'title:play', true);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
    await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      if (!scene.build({ col: 7, row: 5 }, 'musketeer').ok) throw new Error('Fixture could not build');
      scene.input.once('pointerdown', () => scene.registry.set('arrivalAtPress', scene['panel'].arrival));
    });
    await mapPress(page, 7, 5, true);
    const arrival = await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      return Number(scene.registry.get('arrivalAtPress'));
    });
    if (reducedMotion === 'reduce') expect(arrival).toBe(1);
    else expect(arrival).toBeLessThan(1);
    await press(page, 'panel:upgrade', true);
    expect(await page.evaluate(() => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      return scene.state.towers[0].upgraded;
    })).toBe(true);
  });
}
