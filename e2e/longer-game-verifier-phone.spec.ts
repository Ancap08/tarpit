import { test, expect } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { COLORS } from '../src/game/palette';
import { press } from './campaign';
import { waitForTitle } from './title';
import { iconSizeCheck, inputChecks, layoutChecks } from './longerGameVerifierShared';
inputChecks(true);
layoutChecks(true);
iconSizeCheck(true);

test('the reward rail stays drawn and tappable during a map shake', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  await press(page, 'title:play', true);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  const pixels = () => page.evaluate(() => {
    const t = window.__tarpit!;
    const r = t.uiRects()['boon:stoneWalls'];
    const context = t.game.canvas.getContext('2d')!;
    const [red, green, blue] = context.getImageData(r.x + 4, r.y + 4, 1, 1).data;
    return (red << 16) | (green << 8) | blue;
  });
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
      state: { boons: string[] }; redraw(): void;
    };
    scene.state.boons = ['longBarrels', 'stickyTar', 'stoneWalls'];
    scene.redraw();
  });
  // Sample the filled corner of the third button, level with the moving map.
  await expect.poll(pixels).toBe(COLORS.button);
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
      fx: { shake(s: { ms: number; px: number }): void };
    };
    scene.fx.shake({ ms: 3000, px: 8 });
  });
  await page.waitForFunction(() => window.__tarpit!.fx()!.camera.x !== 0);
  expect(await pixels()).toBe(COLORS.button);
  await press(page, 'boon:stoneWalls', true);
  expect(await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).uiState().boonTooltip)).toBe('stoneWalls');
  expect(await page.evaluate(() => window.__tarpit!.fx()!.camera.split)).toBe(true);
});
