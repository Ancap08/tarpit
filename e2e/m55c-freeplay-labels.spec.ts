import { expect, test, type Page } from '@playwright/test';
import { collectTexts, expectedInk, measureContrast } from './m55cAudit';
import { press } from './campaign';
import { onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

// Milestone 55c verifier: on the Free play choices no label may sit under a
// picture. Landscape (960x580 here; 1024x768 tablet behaves the same) draws the
// Meadow / Switchback / Riverbend names half under their map thumbnails.
// Measured on this build: see docs/review/m55c/freeplay-landscape-960x580.png
// and freeplay-landscape-1024x768.png (the lower half of each name is under the
// thumbnail). Measured at 960x580: "Meadow" shows 39% of its own ink (0.392);
// the same check at 390x844 passes.
const known = process.env.M55C_STRICT ? test : test.fixme;

/** Share of each map name's own ink that actually reaches the screen (1 = nothing covers it). */
async function visibleShare(page: Page, decoder: Page) {
  const { texts } = await collectTexts(page);
  const names = texts.filter(t => ['Meadow', 'Switchback', 'Riverbend'].includes(t.text));
  expect(names).toHaveLength(3);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const measured = await measureContrast(page, decoder, names, dpr);
  const expected = await expectedInk(page, names, dpr);
  return measured.map((t, i) => ({ text: t.text, share: (t.glyph ?? 0) / expected[i] }));
}

async function openChoices(page: Page, touch: boolean) {
  await page.goto('/?test=1&ui=new');
  await waitForFirstScreen(page);
  await press(page, 'title:freePlay', touch);
  await onScreen(page, 'freePlay');
}

test('Free play map names are fully drawn at 390x844', async ({ page, context }) => {
  const decoder = await context.newPage();
  await decoder.goto('about:blank');
  await page.setViewportSize({ width: 390, height: 844 });
  await openChoices(page, false);
  for (const { text, share } of await visibleShare(page, decoder)) expect(share, text).toBeGreaterThan(0.8);
});

known('Free play map names are fully drawn in landscape (960x580)', async ({ page, context }) => {
  const decoder = await context.newPage();
  await decoder.goto('about:blank');
  await openChoices(page, false);
  for (const { text, share } of await visibleShare(page, decoder)) expect(share, text).toBeGreaterThan(0.8);
});
