import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api } from './campaign';
import { tipsVerifierSuite } from './tipsVerifier';
import { waitForFirstScreen } from './title';

tipsVerifierSuite(false);

for (const [wave, hint] of [[3, 'Barricade unlocked'], [6, 'Guards unlocked']] as const) {
  for (const { level, cheat, allowed } of [
    { level: 1, cheat: false, allowed: false },
    { level: 1, cheat: true, allowed: true },
    { level: 8, cheat: false, allowed: true },
  ]) {
    test(`level ${level} shows "${hint}" at wave ${wave} only when available (cheat=${cheat})`, async ({ page }) => {
      await page.goto('/?test=1');
      await waitForFirstScreen(page);
      await page.evaluate((level) => (window.__tarpit as TarpitTestApi).startLevel(level), level);
      await page.waitForFunction(() => (window.__tarpit as TarpitTestApi | undefined)?.screen() === 'game');
      if (cheat) await api(page, (t) => t.cheatGold());
      await page.evaluate((wave) => {
        const t = window.__tarpit as TarpitTestApi;
        t.state().wave = wave - 1;
        t.startWave();
        t.step(5);
      }, wave);
      expect(await api(page, (t) => t.state().wave)).toBe(wave);
      expect(await api(page, (t) => t.ui().momentBanner)).toBe(allowed ? hint : null);
    });
  }
}
