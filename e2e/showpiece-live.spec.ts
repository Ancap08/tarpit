import { expect, test } from '@playwright/test';
import { liveMeadow, selectDuringPush } from './showpiece-live';

test('a mouse click follows the moving map while the HUD stays still', async ({ page }) => {
  test.setTimeout(80_000);
  await selectDuringPush(page, false);
});

test('slow real frames shed two detail tiers', async ({ page }) => {
  test.setTimeout(80_000);
  await liveMeadow(page);
  const result = await page.evaluate(async () => {
    const api = window.__tarpit!;
    const loop = api.game.loop;
    loop.sleep();
    // Drive the actual renderer at 20 fps for three seconds, including
    // all normal scene updates. The governor still reads the browser clock.
    const drive = setInterval(() => loop.step(performance.now()), 50);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return { tier: api.showpiece!()?.tier, label: document.querySelector('output')?.textContent };
    } finally {
      clearInterval(drive);
      loop.wake();
    }
  });
  expect(result).toEqual({ tier: 0, label: 'Detail · Low' });
});

test('the victory salute lights the open field beside the result buttons', async ({ page }) => {
  test.setTimeout(80_000);
  await liveMeadow(page, '&showpieceTier=2');
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as import('../src/game/GameScene').GameScene;
    scene.state.phase = 'won';
    scene.redraw();
  });
  // The left sky is outside the parchment. Its brightest launch sparks
  // must remain luminous after the result screen darkens the meadow.
  await page.waitForFunction(() => {
    const canvas = window.__tarpit!.game.canvas;
    const pixels = canvas.getContext('2d')!.getImageData(65, 48, 125, 138).data;
    let lit = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] > 200 && pixels[i + 1] > 143 && pixels[i + 2] < 185) lit++;
    }
    return lit >= 15;
  }, undefined, { polling: 'raf', timeout: 15_000 });
  expect(await page.evaluate(() => window.__tarpit!.uiRects().playAgain)).toBeTruthy();
});
