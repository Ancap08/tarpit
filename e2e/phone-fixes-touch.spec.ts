import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { liftPage, rectPage, startGame, state, touchDrag, ui, worldPage } from './phone';
import { snapCases } from './snapCases';

// Milestone 35, tablet project (1024 x 768 touch, landscape, a cell 34 CSS
// px on screen): touch snapping and nearest-tower selection work as on the
// phone; the magnifier stays off (cells are 28 CSS px or more).

test('a touch drag over the trail margin snaps and builds; no magnifier on the tablet', async ({ page }) => {
  await startGame(page);
  const c = snapCases('meadow').find((k) => k.kind === 'path')!;
  const client = await page.context().newCDPSession(page);
  const at = await worldPage(page, c.at);
  await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), { x: at.x, y: at.y + (await liftPage(page)) }, async () => {
    const u = await ui(page);
    expect(u.dragging?.cell).toEqual(c.expected);
    expect(u.snap).toMatchObject({ cell: c.expected });
    expect(u.magnifier).toBeNull();
  });
  expect((await state(page)).towers.map((t) => t.cell)).toEqual([c.expected]);
});

test('a touch drag over a cell with nothing valid near shows red and cancels', async ({ page }) => {
  await startGame(page);
  const c = snapCases('meadow').find((k) => k.kind === 'none')!;
  const client = await page.context().newCDPSession(page);
  const at = await worldPage(page, c.at);
  await touchDrag(page, client, await rectPage(page, 'bar:musketeer'), { x: at.x, y: at.y + (await liftPage(page)) }, async () => {
    expect((await ui(page)).dragging?.cell).toEqual(c.under);
    expect((await ui(page)).snap).toBeNull();
  });
  expect((await state(page)).towers).toHaveLength(0);
});

test('a touch tap near a tower selects it', async ({ page }) => {
  await startGame(page);
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).buildAt(7, 5, 'musketeer'));
  const near = await worldPage(page, { x: 7 * 32 + 16, y: 5 * 32 + 16 + 22 });
  await page.touchscreen.tap(near.x, near.y);
  expect(await ui(page)).toMatchObject({ panelOpen: true, selectedCell: { col: 7, row: 5 } });
});
