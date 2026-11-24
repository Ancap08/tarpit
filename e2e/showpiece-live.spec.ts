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
