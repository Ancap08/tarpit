import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { press } from './campaign';
import { waitForGame } from './painted';
import { waitForFirstScreen, waitForTitle } from './title';

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

test('a complete First Watch reaches the Painted result at every tier with or without pauses', async ({ page }) => {
  test.setTimeout(180_000);
  const play = async (look: string, withPauses: boolean) => {
    await page.goto('/?test=1&perf=1&look=' + look);
    await waitForFirstScreen(page);
    await press(page, 'title:campaign');
    await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:stop:1']);
    await press(page, 'title:stop:1');
    await page.waitForFunction(() => !!window.__tarpit!.uiRects()['title:play']);
    await press(page, 'title:play');
    await waitForGame(page);
    return page.evaluate(withPauses => {
      const a = window.__tarpit! as Required<NonNullable<typeof window.__tarpit>>;
      const state = a.state();
      const cells = [[2,5],[6,6],[3,3],[7,1],[10,1],[14,3],[14,6],[14,9],
        [13,13],[16,10],[19,10],[22,10],[22,7],[22,4],[25,4],[28,7]];
      let pauses = 0;
      for (let w = 0; w < 6; w++) {
        if (state.phase !== 'setup') throw Error('Expected setup before wave ' + (w + 1));
        for (const [col,row] of cells.slice(state.towers.length)) {
          if (!a.buildAt(col, row, state.towers.length % 2 ? 'musketeer' : 'longbow').ok) break;
        }
        a.startWave();
        a.step(120);
        if (withPauses) {
          const tick = state.tick;
          a.pause();
          a.step(600);
          if (!a.paused() || state.tick !== tick) throw Error('Pause advanced wave ' + state.wave);
          a.resume();
          pauses++;
        }
        // Keep drawing during combat, including each tier's crew and field effects.
        for (let frame = 0; frame < 600 && a.state().phase === 'wave'; frame++) a.step(60);
      }
      return { state: JSON.stringify(state), tier: a.showpiece?.()?.tier, phase: state.phase, pauses };
    }, withPauses);
  };
  const straight = await play('painted', false);
  expect(straight.phase).toBe('won');
  for (const withPauses of [false, true]) {
    if (withPauses) expect((await play('painted', true)).state).toBe(straight.state);
    for (const tier of [0, 1, 2]) {
      const shown = await play('showpiece&showpieceTier=' + tier, withPauses);
      expect(shown).toEqual({ state: straight.state, tier, phase: 'won', pauses: withPauses ? 6 : 0 });
    }
  }
});
