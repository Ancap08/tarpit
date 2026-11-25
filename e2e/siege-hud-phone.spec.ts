import { expect, test } from '@playwright/test';
import { checkLabel } from './hudButtonLabels';
import { rectPage } from './phone';
import { siegeHudCases } from './siegeHud';

siegeHudCases([664, 844]);

test('touch Repair at 390 × 844 charges the displayed top-up price', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?keep=1&test=1');
  await page.waitForFunction(() => window.__tarpit?.keep?.() && !!window.__tarpit.uiRects().repair, null, { timeout: 40_000 });
  await page.evaluate(() => {
    const api = window.__tarpit!;
    api.state!().gate!.hp = 479;
    api.state!().gold = 0;
    api.step!(0);
  });
  const repair = page.getByRole('button', { name: 'Repair 1. Costs the third star', exact: true });
  await expect(repair).toBeDisabled();
  await checkLabel(page, 'repair', 'Repair 1');
  await page.evaluate(() => {
    const api = window.__tarpit!;
    api.state!().gold = 1;
    api.step!(0);
  });
  await expect(repair).toBeEnabled();
  const { x, y } = await rectPage(page, 'repair');
  await page.touchscreen.tap(x, y);
  await expect(page.getByRole('button', { name: 'Repair', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => {
    const state = window.__tarpit!.state!();
    return [state.gate!.hp, state.gold];
  })).toEqual([480, 0]);
});
