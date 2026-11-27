import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';

async function openKeep(page: Page): Promise<void> {
  await page.goto('/?test=1&ui=new&owner=1&keep=21');
  await page.waitForFunction(() => !!window.__tarpit?.keep?.());
}

for (const { name, width, height, x, depth } of [
  { name: 'landscape', width: 1280, height: 800, x: 44, depth: 8 },
  { name: 'portrait', width: 390, height: 844, x: 12, depth: 16 },
]) {
  test(`the ${name} curtain has solid rock between the outer buttresses`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openKeep(page);
    const alpha = await page.evaluate(({ x, depth }) => {
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      const keep = scene['keep']!;
      const wall = keep['surround']['castle'][2];
      const pixels = wall.getContext('2d')!.getImageData(
        Math.round(x - parseFloat(wall.style.left)) - 2,
        Math.round(keep['gate'].y + depth - parseFloat(wall.style.top)) - 2, 5, 5).data;
      return Math.min(...pixels.filter((_, i) => i % 4 === 3));
    }, { x, depth });
    expect(alpha, 'Rock between the buttress feet occludes the crag').toBeGreaterThanOrEqual(250);
  });
}

test('the east approach remains visible below the barbican sill in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await openKeep(page);
  const paved = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const keep = scene['keep']!, sill = keep.outerGate!;
    // Sample the uncovered strip just in front of the visual threshold.
    // Include the wall and deck in the composite: either can mask a road
    // that appears correctly aligned when the ground plate is viewed alone.
    const surface = keep['surround'].stillSurface();
    const pixels = surface.getContext('2d')!.getImageData(
      Math.round(sill.x - parseFloat(surface.style.left)) - 8,
      Math.round(sill.y - parseFloat(surface.style.top)) + 14, 18, 7).data;
    return pixels.filter((red, i) => i % 4 === 0 &&
      .2126 * red + .7152 * pixels[i + 1] + .0722 * pixels[i + 2] >= 65).length / 126;
  });
  expect(paved, 'Visible paving spans the approach lip beneath the arch').toBeGreaterThanOrEqual(.65);
});
