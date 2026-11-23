import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api } from './campaign';
import { tipsVerifierSuite } from './tipsVerifier';
import { waitForFirstScreen } from './title';

tipsVerifierSuite(false);

test('level 1 does not announce an unlocked Barricade at wave 3 (it has none)', async ({ page }) => {
  // Pins a defect that predates milestone 42 (fx/moments.ts shows the unlock banner in every game):
  // level 1 offers the Powder Keg only, yet says "Barricade unlocked". Remove test.fail when fixed.
  test.fail();
  await page.goto('/?test=1');
  await waitForFirstScreen(page);
  await api(page, (t) => t.startLevel(1));
  await page.waitForFunction(() => (window.__tarpit as TarpitTestApi | undefined)?.screen() === 'game');
  await api(page, (t) => { t.state().wave = 2; t.startWave(); t.step(5); });
  expect(await api(page, (t) => t.ui().momentBanner)).not.toBe('Barricade unlocked');
});
