import { expect, type Page } from '@playwright/test';
import { api, rectPage } from './phone';
import { waitForTitle } from './title';

export const paintedAsset = '**/assets/painted/**';

export async function click(page: Page, name: string): Promise<void> {
  const { x, y } = await rectPage(page, name);
  await page.mouse.click(x, y);
}

export async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') === true);
}

export const painted = (page: Page) => api(page, (a) => a.painted());
export const settle = (page: Page) =>
  page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });

export async function openPainted(page: Page): Promise<void> {
  await page.goto('/?test=1&look=painted');
  await waitForTitle(page);
  await api(page, (a) => a.startGame());
  await expect.poll(() => painted(page)).toMatchObject({ active: true });
}

export async function midwave(page: Page): Promise<void> {
  await api(page, (a) => {
    a.state().gold = 1000;
    a.state().wave = 1;
    a.buildAt(7, 5, 'musketeer');
    a.buildAt(15, 9, 'cannon');
    a.buildAt(18, 9, 'tarpit');
    a.startWave();
    a.step(1880);
  });
  await settle(page);
}

export async function stageMeadowDirections(page: Page): Promise<void> {
  // One test enemy near the middle of each actual Meadow segment. There is
  // no westbound segment on this map; a portrait turn produces west.
  await api(page, (a) => {
    a.spawnHorde(7);
    const distances = [80, 232, 434, 708, 982, 1208, 1444];
    const staged = a.state().enemies;
    staged.forEach((enemy, index) => {
      enemy.distance = distances[index];
    });
    a.step(1);
  });
}

export async function expectMeadowDirections(page: Page, portrait: boolean): Promise<void> {
  expect(await api(page, (a) => a.layout())).toBe(portrait ? 'portrait' : 'landscape');
  const points = [[81, 240], [160, 167], [291, 96], [420, 241], [551, 384], [680, 287], [821, 192]];
  const frames = portrait ? [8, 4, 8, 12, 8, 4, 8] : [4, 0, 4, 8, 4, 0, 4];
  const sprites = (await painted(page)).sprites.filter((sprite) => sprite.visible && sprite.key.includes(':goblin:'));
  for (const [index, [x, y]] of points.entries()) {
    const [sx, sy] = portrait ? [480 - y, 76 + x] : [x, y];
    expect(sprites, `Meadow path segment ${index + 1}`).toContainEqual(expect.objectContaining({
      x: sx,
      y: sy,
      frame: frames[index],
    }));
  }
}
