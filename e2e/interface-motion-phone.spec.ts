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
  const settle = () => page.evaluate(() => new Promise<void>(resolve => window.__tarpit!.game.events.once('postrender', resolve)));
  await settle();
  const pixels = await page.evaluate(() => {
    const { game } = window.__tarpit!;
    const { width, height, left, top } = game.canvas.getBoundingClientRect();
    const ink = document.querySelector<HTMLCanvasElement>('canvas[data-interface-ink]')!;
    const nativeWidth = Math.round((left + width) * devicePixelRatio) - Math.round(left * devicePixelRatio);
    const nativeHeight = Math.round((top + height) * devicePixelRatio) - Math.round(top * devicePixelRatio);
    const labels = game.scene.getScene('game').children.list.filter(object => object.type === 'Text')
      .map(object => object as Phaser.GameObjects.Text).filter(text => text.visible && text.text);
    return {
      native: ink.width === nativeWidth && ink.height === nativeHeight,
      matched: labels.every(text => text.style.resolution === ink.width / game.scale.width),
      scaled: labels.filter(text => text.scaleX !== 1 || text.scaleY !== 1).map(text => text.text),
    };
  });
  expect(pixels).toEqual({ native: true, matched: true, scaled: [] });
  const screenshot = await page.screenshot();
  await settle();
  expect(await panel()).toEqual(before);
  expect((await page.screenshot()).equals(screenshot), 'frozen frames are byte-identical').toBe(true);
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
