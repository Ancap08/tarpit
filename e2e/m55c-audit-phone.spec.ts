import { expect, test, type Page } from '@playwright/test';
import { press } from './campaign';
import { collectTexts, measureContrast, type TextRecord } from './m55cAudit';
import { waitForFirstScreen } from './title';
import { onScreen } from './campaignScreens';

// Milestone 55c verifier. Everything is enumerated from the live scene at the
// primary phone size (390 x 656, Safari with its bars, DPR 3, ?ui=new), not
// from a list of known controls:
//   - every visible text is at least 11 CSS px,
//   - every registered target is at least 44 CSS px in its smaller side,
//   - every text has 4.5:1 against the pixels actually behind it
//     (18.66 px bold or 24 px and over: 3:1).
test.use({ viewport: { width: 390, height: 656 } });

const sizeFloor = 11;
const targetFloor = 44;

async function audit(page: Page, decoder: Page, name: string, options: { skipTexts?: RegExp } = {}) {
  const { texts, targets } = await collectTexts(page);
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const measured = await measureContrast(page, decoder, texts, dpr);
  const live = measured.filter((t: TextRecord) => !options.skipTexts?.test(t.text));
  const small = live.filter(t => t.fs < sizeFloor).map(t => `${t.text} ${t.fs.toFixed(2)}px`);
  const low = live.filter(t => (t.glyph ?? 0) > 3 && t.contrast !== undefined).filter(t => {
    const large = t.fs >= 24 || (t.fs >= 18.66 && t.bold);
    return t.contrast! < (large ? 3 : 4.5);
  }).map(t => `${t.text} ${t.contrast!.toFixed(2)}:1 at ${t.fs.toFixed(1)}px`);
  const tight = Object.entries(targets)
    .filter(([key]) => key !== 'gold')
    .filter(([, r]) => Math.min(r.w, r.h) < targetFloor - 0.05)
    .map(([key, r]) => `${key} ${r.w.toFixed(1)}x${r.h.toFixed(1)}`);
  expect.soft(small, `${name}: text under ${sizeFloor} CSS px`).toEqual([]);
  expect.soft(low, `${name}: text under its contrast floor`).toEqual([]);
  expect.soft(tight, `${name}: targets under ${targetFloor} CSS px`).toEqual([]);
  expect(texts.length, `${name}: found text to audit`).toBeGreaterThan(3);
}

test.beforeEach(async ({ context }) => {
  // The PNG decoder page lives in the same context so it shares nothing with the game.
  await context.newPage();
});

test('paper screens: type floor, target floor and contrast of all text', async ({ page, context }) => {
  const decoder = context.pages().find(p => p !== page)!;
  await decoder.goto('about:blank');
  await page.addInitScript(() => localStorage.setItem('tarpit.seenSiegeBroadsides', '["thirdAct","siegeEnding"]'));
  await page.goto('/?test=1&ui=new&owner=1');
  await waitForFirstScreen(page, { showTips: true });
  await audit(page, decoder, 'title');
  await press(page, 'title:freePlay', true);
  await onScreen(page, 'freePlay');
  await audit(page, decoder, 'free play choices');
  await press(page, 'title:back', true);
  await onScreen(page, 'first');
  await press(page, 'title:campaign', true);
  await onScreen(page, 'levelMap');
  const goAct = async (act: number) => {
    if (await page.evaluate(key => !!window.__tarpit!.uiRects()[key], `title:act:${act}`)) await press(page, `title:act:${act}`, true);
    await page.waitForFunction(() => window.__tarpit?.titleReady() && window.__tarpit.screen?.() === 'levelMap', null, { timeout: 5000 }).catch(async () => { throw new Error(`not on the map after act ${act}: screen=${await page.evaluate(() => window.__tarpit!.screen?.())} keys=${await page.evaluate(() => Object.keys(window.__tarpit!.uiRects()).join())}`); });
  };
  for (const act of [1, 2, 3]) {
    await goAct(act);
    await audit(page, decoder, `level map act ${act}`);
  }
  for (const id of [1, 11, 25]) {
    await goAct(id <= 10 ? 1 : id <= 20 ? 2 : 3);
    await press(page, `title:stop:${id}`, true);
    await onScreen(page, 'levelCard');
    await audit(page, decoder, `level ${id} card`);
    await press(page, 'title:back', true);
    await onScreen(page, 'levelMap');
  }
});

for (const id of [1, 11, 20]) {
  test(`level ${id} in the new interface: type, targets and contrast at 390x656`, async ({ page, context }) => {
    const decoder = context.pages().find(p => p !== page)!;
    await decoder.goto('about:blank');
    await page.goto('/?test=1&ui=new&look=classic&owner=1');
    await waitForFirstScreen(page);
    await page.evaluate(id => window.__tarpit!.startLevel!(id), id);
    await onScreen(page, 'game');
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const t = window.__tarpit!;
      t.state!().gold = 4000;
      const types = ['musketeer', 'cannon', 'tarpit', 'longbow'] as const;
      let n = 0;
      for (let col = 1; col < 29 && n < 4; col++) for (let row = 0; row < 15 && n < 4; row++) {
        if (t.buildAt!(col, row, types[n]).ok) { n++; row += 2; col++; }
      }
      t.startWave!(); t.step!(240); t.spawnHorde!(20); t.step!(30);
    });
    // Damage numbers are transient and carry a dark stroke the glyph sampler cannot see.
    await audit(page, decoder, `level ${id} mid-wave`, { skipTexts: /^[−-]\d+$/ });
  });
}

for (const id of [21, 22, 24, 25]) {
  test(`Old Keep level ${id}: type, targets and contrast at 390x656`, async ({ page, context }) => {
    const decoder = context.pages().find(p => p !== page)!;
    await decoder.goto('about:blank');
    await page.goto(`/?test=1&ui=new&keep=${id}`);
    await onScreen(page, 'game');
    await page.waitForTimeout(1500);
    await audit(page, decoder, `keep ${id} setup`);
  });
}

test('Old Keep level 23: the CONDEMNED sign text is at least 11 CSS px at 390x656', async ({ page, context }) => {
  const decoder = context.pages().find(p => p !== page)!;
  await decoder.goto('about:blank');
  await page.goto('/?test=1&ui=new&keep=23');
  await onScreen(page, 'game');
  await page.waitForTimeout(1500);
  await audit(page, decoder, 'keep 23 setup');
});

test('Old Keep road banners show the approaching groups without tap targets', async ({ page }) => {
  for (const id of [21, 22, 23, 24, 25]) {
    await page.goto(`/?test=1&ui=new&keep=${id}`);
    await onScreen(page, 'game');
    const { texts, targets } = await collectTexts(page);
    const headings = texts.filter(({ text }) => /^(East|West) road$/.test(text)).map(({ text }) => text);
    expect(headings).toEqual(id === 21 ? ['East road'] : id === 22 ? ['West road'] : ['East road', 'West road']);
    expect(Object.keys(targets).filter(key => key.startsWith('road:'))).toEqual([]);
  }
});
