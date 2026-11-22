import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { cellPage, rectPage, startGame, state, ui, worldPage } from './phone';
import { snapCases } from './snapCases';

// Milestone 35, desktop project (mouse): placement and selection stay
// exact. A mouse drag over a cell that cannot take the tower stays there
// (red) and cancels; no magnifier; a click beside a tower does not select it.

test('a mouse drag over the trail margin, water, the cottage or a tower does not snap', async ({ page }) => {
  for (const map of ['meadow', 'riverbend'] as const) {
    await startGame(page, 'normal', map);
    await page.evaluate(() => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().gold = 1000;
    });
    for (const c of snapCases(map).filter((k) => k.kind !== 'none')) {
      if (c.kind === 'occupied') await page.evaluate(([col, row]) => (window.__tarpit as TarpitTestApi).buildAt(col, row, 'cannon'), [c.under.col, c.under.row]);
      const towers0 = (await state(page)).towers.length;
      const from = await rectPage(page, 'bar:musketeer');
      const to = await worldPage(page, c.at);
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      await page.mouse.move(to.x, to.y, { steps: 8 });
      const u = await ui(page);
      expect(u.dragging?.cell, `${map} ${c.kind}`).toEqual(c.under);
      expect(u.snap).toBeNull();
      expect(u.magnifier).toBeNull();
      await page.mouse.up();
      expect((await state(page)).towers).toHaveLength(towers0);
    }
  }
});

test('a mouse click beside a tower does not select it', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  const near = await worldPage(page, { x: 7 * 32 + 16 + 22, y: 5 * 32 + 16 });
  await page.mouse.click(near.x, near.y);
  expect((await ui(page)).panelOpen).toBe(false);
  const on = await cellPage(page, { col: 7, row: 5 });
  await page.mouse.click(on.x, on.y);
  expect((await ui(page)).panelOpen).toBe(true);
});
