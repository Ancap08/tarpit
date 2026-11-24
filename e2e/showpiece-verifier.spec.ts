import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { waitForTitle } from './title';

// Milestone 47 verifier: the experimental look must leave the simulation
// alone. The same scripted Free play Meadow game is stepped in frozen test
// mode (the experiment draws every step there) under Painted and under each
// pinned detail tier, in 1 and 3 tick chunks; the full state must match.

async function playScripted(page: Page, query: string, chunk: number): Promise<string> {
  await page.goto('/?test=1&perf=1' + query);
  await waitForTitle(page);
  await page.evaluate(() => window.__tarpit!.startGame!('normal', 'meadow'));
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') === true);
  return page.evaluate((chunk) => {
    const api = window.__tarpit! as Required<NonNullable<typeof window.__tarpit>>;
    const scene = api.game.scene.getScene('game') as GameScene;
    const cells: [number, number, 'musketeer' | 'longbow' | 'cannon' | 'mortar'][] =
      [[7, 5, 'musketeer'], [9, 3, 'longbow'], [12, 8, 'cannon'], [23, 5, 'mortar'], [5, 3, 'longbow'], [8, 8, 'musketeer']];
    let waves = 0;
    for (let n = 0; n < 60_000 && waves < 3; n += 1) {
      const state = api.state();
      if (state.phase === 'won' || state.phase === 'lost') break;
      if (state.phase === 'setup') {
        const offer = api.pendingBoon();
        if (offer) api.pickBoon(offer.options[0]);
        scene.state.gold = 100_000;
        for (const [c, r, t] of cells) api.buildAt(c, r, t);
        api.startWave();
        waves += 1;
      }
      api.step(chunk);
    }
    return JSON.stringify(api.state());
  }, chunk);
}

for (const chunk of [1, 3]) {
  test(`showpiece reaches the Painted state after three waves, ${chunk} tick(s) a step`, async ({ page }) => {
    test.setTimeout(240_000);
    const painted = await playScripted(page, '&look=painted', chunk);
    for (const tier of [0, 1, 2]) {
      const shown = await playScripted(page, `&look=showpiece&showpieceTier=${tier}`, chunk);
      expect(await page.evaluate(() => window.__tarpit!.showpiece?.()?.tier)).toBe(tier);
      expect(shown, `tier ${tier}`).toBe(painted);
    }
  });
}
