import { siegeVerifierCases } from './siege-verifier-cases';
import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { tap } from './phone';

siegeVerifierCases(true, [664, 844]);
test.describe('new interface', () => siegeVerifierCases(true, [656, 664, 844], true));

test('windows receive the tap on the moving and settled Keep view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 656 });
  await page.goto('/?ui=new&keep=23&perf=1&renderer=canvas');
  await page.waitForFunction(() => window.__tarpit?.keep?.() && document.querySelector<HTMLElement>('#keep-status')?.hidden);
  await tap(page, 'startWave');
  const seed = (index: number) => page.evaluate(index => {
    const game = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const state = game.state;
    if (state.phase !== 'wave') throw new Error('Wave did not start');
    const pillow = state.windows![index];
    state.enemies.push({ id: state.nextEnemyId++, type: 'goblin', road: pillow.road,
      distance: (pillow.from + pillow.to) / 2, hp: 1000, slow: 0, slowTicksLeft: 0 });
  }, index);
  await seed(0);
  await page.waitForFunction(() => {
    const game = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return (game['siegeView']?.verticalScale ?? 0) > 1.18;
  });
  await tap(page, 'window:0');
  await expect.poll(() => page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.windows![0].used;
  })).toBe(true);
  await page.waitForFunction(() => {
    const game = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return game['siegeView']?.verticalScale === 1.5;
  });
  await seed(1);
  await tap(page, 'window:1');
  expect(await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    return scene.state.windows!.map(window => window.used);
  })).toEqual([true, true]);
});
