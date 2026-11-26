import { expect, test, type Page } from '@playwright/test';
import { collectTexts, expectedInk, measureContrast } from './m55cAudit';
import { press } from './campaign';
import { onScreen } from './campaignScreens';
import { waitForFirstScreen } from './title';

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

for (const [width, height] of [[960, 580], [1024, 768], [390, 656], [390, 844]]) {
  test(`Free play map names are fully drawn at ${width}x${height}`, async ({ page, context }, info) => {
    const decoder = await context.newPage();
    await decoder.goto('about:blank');
    await page.setViewportSize({ width, height });
    await openChoices(page, false);
    const labels = await visibleShare(page, decoder);
    await info.attach('Visible ink ratio', { body: JSON.stringify(labels), contentType: 'application/json' });
    for (const { text, share } of labels) expect(share, text).toBeGreaterThan(0.8);
  });
}
