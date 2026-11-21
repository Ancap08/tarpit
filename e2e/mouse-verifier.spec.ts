import { expect, test } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Desktop project: a mouse still builds with one click (no two-click regression).
test('mouse: pick then a single click on (7,5) builds', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const r = await page.evaluate(() => (window.__tarpit as TarpitTestApi).uiRects());
  const b = r['bar:musketeer'];
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.click(7 * 32 + 16, 5 * 32 + 16);
  const s = await page.evaluate(() => (window.__tarpit as TarpitTestApi).state());
  expect(s.towers.map((t) => t.cell)).toEqual([{ col: 7, row: 5 }]);
  expect(s.gold).toBe(50);
  expect(await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui())).toMatchObject({ isTouch: false, armedCell: null });
});
