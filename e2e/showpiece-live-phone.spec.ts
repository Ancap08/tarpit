import { expect, test } from '@playwright/test';
import { liveMeadow, selectDuringPush } from './showpiece-live';

test('a portrait tap on a moving Meadow tower selects it', async ({ page }) => {
  test.setTimeout(80_000);
  await selectDuringPush(page, true);
});

test('reduced motion holds the Meadow clock and camera while the wave plays', async ({ page }) => {
  test.setTimeout(80_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await liveMeadow(page);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
    scene.startWave();
  });
  await page.waitForFunction(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
    return scene.state.enemies.length > 1;
  });
  expect(await page.evaluate(() => window.__tarpit!.showpiece!())).toMatchObject({ calm: true, timeMs: 0, zoom: 1 });
});
