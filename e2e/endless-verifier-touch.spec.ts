import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 26 verifier, tablet project (iPad landscape): the win screen's
// three buttons measured on the page, a double tap on Keep going, and taps
// where the buttons were.

type Rect = { x: number; y: number; width: number; height: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const toPage = (page: Page, x: number, y: number) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [x, y]);

async function pageRect(page: Page, r: Rect): Promise<Rect> {
  const a = await toPage(page, r.x, r.y);
  const b = await toPage(page, r.x + r.width, r.y + r.height);
  return { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y };
}

test('tablet win screen: three buttons 44 px tall, 8 px apart, inside the canvas; double tap on Keep going only keeps going', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  expect(await api(page, (a) => a.runScript('comboBuild'))).toBe('won');
  const r = await api(page, (a) => a.uiRects());
  const row = [await pageRect(page, r.keepGoing), await pageRect(page, r.playAgain), await pageRect(page, r.menu)];
  const canvas = (await page.locator('canvas').boundingBox())!;
  for (const [i, b] of row.entries()) {
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.x).toBeGreaterThanOrEqual(canvas.x);
    expect(b.x + b.width).toBeLessThanOrEqual(canvas.x + canvas.width);
    expect(b.y).toBeGreaterThanOrEqual(canvas.y);
    expect(b.y + b.height).toBeLessThanOrEqual(canvas.y + canvas.height);
    if (i > 0) expect(b.x - (row[i - 1].x + row[i - 1].width)).toBeGreaterThanOrEqual(8);
  }
  const before = await api(page, (a) => ({ towers: a.state().towers.length, gold: a.state().gold }));
  const k = row[0];
  await page.touchscreen.tap(k.x + k.width / 2, k.y + k.height / 2);
  await page.touchscreen.tap(k.x + k.width / 2, k.y + k.height / 2);
  expect(await api(page, (a) => a.endScreen())).toBeNull();
  // Taps where Play again and Menu were are map taps now.
  for (const b of [row[1], row[2]]) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  expect(await api(page, (a) => a.scene())).toBe('game');
  const s = await api(page, (a) => a.state());
  expect(s).toMatchObject({ phase: 'setup', endless: true, wave: 10, gold: before.gold });
  expect(s.towers.length).toBe(before.towers);
  const ui = await api(page, (a) => a.ui());
  expect(ui.pick).toBeNull();
  expect(ui.armedCell).toBeNull();
});
