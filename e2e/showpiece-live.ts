import { expect, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { click, waitForGame } from './painted';
import { waitForTitle } from './title';

export async function liveMeadow(page: Page, query = ''): Promise<void> {
  await page.goto('/?renderer=canvas&perf=1&look=showpiece' + query);
  await waitForTitle(page);
  await click(page, 'title:play');
  await waitForGame(page);
  expect(await page.evaluate(() => window.__tarpit?.showpiece?.())).toBeTruthy();
}

/** The outer few pixels of this tower project onto the neighbouring cell at
 * full push-in. An uncorrected tap really does select the wrong cell here. */
export async function selectDuringPush(page: Page, touch: boolean): Promise<void> {
  await liveMeadow(page, '&showpieceTier=2');
  await page.evaluate(() => {
    const game = window.__tarpit!.game.scene.getScene('game') as GameScene;
    game.cheatGold();
    if (!game.build({ col: 1, row: 2 }, 'longbow').ok ||
        !game.build({ col: 2, row: 2 }, 'longbow').ok || !game.startWave().ok)
      throw new Error('Could not stage camera check');
  });
  await page.waitForFunction(() => (window.__tarpit?.showpiece?.()?.zoom ?? 1) > 1.032);
  const tap = await page.evaluate(() => {
    const a = window.__tarpit!;
    const centre = a.cellToPage(2, 2);
    const unit = a.worldToPage(81, 80);
    const edge = { x: centre.x - 13 * (unit.x - centre.x), y: centre.y - 13 * (unit.y - centre.y) }; // 3 px inside the outer world-x edge
    const boundary = a.layout() === 'portrait' ? a.canvasToPage(400,76+64) : a.canvasToPage(64,80);
    return { edge, crossed: a.layout() === 'portrait' ? edge.y < boundary.y : edge.x < boundary.x };
  });
  expect(tap.crossed).toBe(true);
  if (touch) await page.touchscreen.tap(tap.edge.x, tap.edge.y);
  else await page.mouse.click(tap.edge.x, tap.edge.y);
  const selection = await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).uiState().selectedCell);
  expect(selection).toEqual({ col: 2, row: 2 });
}
