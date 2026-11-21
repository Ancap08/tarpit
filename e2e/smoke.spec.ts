import { expect, test } from '@playwright/test';

test('title screen boots Phaser', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Tarpit');
  await expect(page.locator('canvas')).toBeVisible();
  const hasGame = await page.evaluate(
    () => window.__tarpit !== undefined && typeof window.__tarpit.scene === 'object',
  );
  expect(hasGame).toBe(true);
});
