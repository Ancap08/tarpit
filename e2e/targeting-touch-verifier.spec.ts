import { expect, test, type Page } from '@playwright/test';
import { targetingButtonText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier probe (c) for milestone 24, tablet project only (the file name
// matches /touch-verifier\.spec\.ts$/ in playwright.config.ts): the
// targeting button cycles by real taps at the 1024x768 touch viewport.

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const ui = (page: Page) => api(page, (a) => a.ui());
const toPage = (page: Page, x: number, y: number) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [x, y]);

async function tapAt(page: Page, x: number, y: number): Promise<void> {
  const p = await toPage(page, x, y);
  await page.touchscreen.tap(p.x, p.y);
}

async function tap(page: Page, name: string): Promise<void> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await tapAt(page, r.x + r.width / 2, r.y + r.height / 2);
}

test('(c) two taps on the targeting button: Last, then Strongest; the button is 44 px tall on screen', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
  const cell = { col: 7, row: 5 };
  expect(await api(page, (a) => a.buildAt(7, 5, 'musketeer').ok)).toBe(true);
  await tapAt(page, cell.col * 32 + 16, cell.row * 32 + 16);
  expect(await ui(page)).toMatchObject({ selectedCell: cell, panelOpen: true, isTouch: true, selectedTargeting: 'first', targetLabel: targetingButtonText('first') });
  const r = (await api(page, (a) => a.uiRects()))['panel:target'];
  const top = await toPage(page, r.x, r.y);
  const bottom = await toPage(page, r.x + r.width, r.y + r.height);
  expect(bottom.y - top.y).toBeGreaterThanOrEqual(44);
  await tap(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'last', targetLabel: targetingButtonText('last'), panelOpen: true });
  await tap(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'strongest', targetLabel: targetingButtonText('strongest'), panelOpen: true });
  expect((await api(page, (a) => a.events())).filter((e) => e.kind === 'targeting').map((e) => (e.kind === 'targeting' ? e.mode : ''))).toEqual(['last', 'strongest']);
  // Close with the × and reopen by tap: still Strongest.
  await tap(page, 'panel:close');
  expect(await ui(page)).toMatchObject({ panelOpen: false });
  await tapAt(page, cell.col * 32 + 16, cell.row * 32 + 16);
  expect(await ui(page)).toMatchObject({ selectedCell: cell, selectedTargeting: 'strongest' });
});
