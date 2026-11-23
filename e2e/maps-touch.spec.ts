import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { DRAG_LIFT } from '../src/game/input';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { TitleUiState } from '../src/game/TitleScene';
import type { MapId } from '../src/sim/map';
import { waitForTitle } from './title';

// Milestone 27, tablet project (playwright.config.ts TABLET_SPECS): pick
// each map by touch, tap Play, drag a Longbow from the bar by real touch
// events (CDP, as e2e/touch-drag.spec.ts), tap Start Wave, and an enemy
// dies. Points are canvas points mapped with canvasToPage(); a touch drag
// aims DRAG_LIFT canvas px above the finger.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function tap(page: Page, name: string): Promise<void> {
  const q = await toPage(page, await rectCentre(page, name));
  await page.touchscreen.tap(q.x, q.y);
}

async function touchDrag(page: Page, client: CDPSession, from: Point, to: Point, steps = 10): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps }] });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const BOW: Record<MapId, Cell> = { meadow: { col: 9, row: 5 }, switchback: { col: 14, row: 7 }, riverbend: { col: 12, row: 5 } };

for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
  test(`${map} by touch: tap its thumbnail, tap Play, drag a Longbow, tap Start Wave, an enemy dies`, async ({ page }) => {
    await page.goto('/?test=1');
    await waitForTitle(page);
    await tap(page, `title:map:${map}`);
    expect(await api(page, (a) => a.scene())).toBe('title');
    expect((await page.evaluate(() => (window.__tarpit as TarpitTestApi).ui<TitleUiState>())).map).toBe(map);
    await tap(page, 'title:play');
    await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game');
    expect((await state(page)).map.id).toBe(map);
    expect((await api(page, (a) => a.hudText())).wave).toBe('Wave 0/20');

    const client = await page.context().newCDPSession(page);
    const target = centre(BOW[map]);
    await touchDrag(page, client, await rectCentre(page, 'bar:longbow'), { x: target.x, y: target.y + DRAG_LIFT });
    expect((await state(page)).towers).toEqual([expect.objectContaining({ cell: BOW[map], type: 'longbow' })]);
    await tap(page, 'startWave');
    expect((await state(page)).phase).toBe('wave');
    const kills = await page.evaluate((c) => {
      const t = window.__tarpit as TarpitTestApi;
      for (let i = 0; i < 60 && t.state().phase === 'wave'; i++) {
        t.step(60);
        const tower = t.state().towers.find((tw) => tw.cell.col === c.col && tw.cell.row === c.row);
        if (tower && tower.kills > 0) return tower.kills;
      }
      return 0;
    }, BOW[map]);
    expect(kills).toBeGreaterThan(0);
  });
}
