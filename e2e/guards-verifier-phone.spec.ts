// Phone variant: guards measured from pixels in portrait, after a turn to
// landscape and back, Classic and Painted.
import { test } from '@playwright/test';
import { api } from './campaign';
import { measure, popupFits, standSquad } from './guardsVerifier';
import { settle } from './painted';

for (const look of ['classic', 'painted'] as const) {
  test(look + ': guards are drawn on their simulation positions in portrait and after turning', async ({ page }) => {
    // Pixel comparisons capture 24 actual rendered frames across two viewport changes.
    test.setTimeout(90_000);
    if (look === 'painted') await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
    await standSquad(page, { x: 420, y: 250 }, true);
    await measure(page, true);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
    await settle(page);
    await api(page, (t) => t.state().blockers.forEach((b) => { if (b.kind === 'guard') (b as { ticksLeft: number }).ticksLeft = 1e9; }));
    await measure(page, false);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(() => window.__tarpit!.layout() === 'portrait');
    await settle(page);
    await measure(page, true);
  });
}

test('five specials fit on the phone, portrait and landscape', async ({ page }) => {
  await popupFits(page, true, true);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(() => window.__tarpit!.layout() === 'landscape');
  await settle(page);
  await popupFits(page, true, false);
});
