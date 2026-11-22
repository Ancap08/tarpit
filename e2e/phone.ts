import { expect, type CDPSession, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { waitForTitle } from './title';

// Helpers for the phone project (milestone 32b, files ending -phone.spec.ts):
// a 390 x 844 touch phone in portrait. Every map point goes through the
// cellToPage() and worldToPage() hooks and every button through uiRects()
// and canvasToPage(), so no spec hard-codes a position.

export type Cell = { col: number; row: number };
export type Point = { x: number; y: number };

export const api = <T>(page: Page, f: (a: TarpitTestApi) => T): Promise<T> =>
  page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
export const state = (page: Page) => api(page, (a) => a.state());
export const ui = (page: Page) => api(page, (a) => a.ui());
export const rects = (page: Page) => api(page, (a) => a.uiRects());

/** Open the title in test mode and wait until its buttons take taps. */
export async function openTitle(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await waitForTitle(page);
}

/** Start a game from the title by the test hook (the title itself is covered by its own test). */
export async function startGame(page: Page, difficulty = 'normal', map = 'meadow'): Promise<void> {
  await openTitle(page);
  await page.evaluate(([d, m]) => (window.__tarpit as TarpitTestApi).startGame(d as 'normal', m as 'meadow'), [difficulty, map]);
}

export const toPage = (page: Page, p: Point): Promise<Point> => page.evaluate(([x, y]) => window.__tarpit!.canvasToPage(x, y), [p.x, p.y]);
export const cellPage = (page: Page, c: Cell): Promise<Point> => page.evaluate(([col, row]) => window.__tarpit!.cellToPage(col, row), [c.col, c.row]);
export const worldPage = (page: Page, p: Point): Promise<Point> => page.evaluate(([x, y]) => window.__tarpit!.worldToPage(x, y), [p.x, p.y]);

/** Page px per canvas px (the FIT scale). */
export async function pageScale(page: Page): Promise<number> {
  const a = await toPage(page, { x: 0, y: 0 });
  const b = await toPage(page, { x: 0, y: 100 });
  return (b.y - a.y) / 100;
}

/** The page centre of a uiRects() button. */
export async function rectPage(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return toPage(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
}

/** A uiRects() button's size on the page (CSS px). */
export async function rectPageSize(page: Page, name: string): Promise<{ width: number; height: number }> {
  const r = (await rects(page))[name];
  const a = await toPage(page, { x: r.x, y: r.y });
  const b = await toPage(page, { x: r.x + r.width, y: r.y + r.height });
  return { width: b.x - a.x, height: b.y - a.y };
}

export async function tap(page: Page, name: string): Promise<void> {
  const p = await rectPage(page, name);
  await page.touchscreen.tap(p.x, p.y);
}

export async function tapCell(page: Page, c: Cell): Promise<void> {
  const p = await cellPage(page, c);
  await page.touchscreen.tap(p.x, p.y);
}

/** The game's touch lift in page px (ui().lift canvas px: 48 CSS px on screen in portrait, 32b follow-up). */
export async function liftPage(page: Page): Promise<number> {
  return (await ui(page)).lift * (await pageScale(page));
}

/** Where a finger goes (page px) so a touch drag aims at cell `c`: the lift below it on the screen. */
export async function fingerFor(page: Page, c: Cell): Promise<Point> {
  const p = await cellPage(page, c);
  return { x: p.x, y: p.y + (await liftPage(page)) };
}

/** A real touch drag between page points in `steps` moves; `during` runs with the finger still down at `to`. */
export async function touchDrag(_page: Page, client: CDPSession, from: Point, to: Point, during?: () => Promise<void>, steps = 10): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** A touch held still at page point `at` for `ms`; `during` runs before the finger lifts. */
export async function touchHold(page: Page, client: CDPSession, at: Point, ms: number, during?: () => Promise<void>): Promise<void> {
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
  await page.waitForTimeout(ms);
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
