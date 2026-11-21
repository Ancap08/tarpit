import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { DRAG_LIFT } from '../src/game/input';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 25a, tablet project (playwright.config.ts TABLET_SPECS): drag to
// place and move by real touch events. page.touchscreen only taps, so drags
// go through CDP Input.dispatchTouchEvent (touchStart, touchMoves,
// touchEnd). The canvas is fitted at 1024 / 960 with letterboxing; every
// point is a canvas point mapped with canvasToPage(). A touch drag aims at
// the cell DRAG_LIFT (48) canvas px above the finger.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const C75: Cell = { col: 7, row: 5 };
const C95: Cell = { col: 9, row: 5 };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });
/** Where the finger goes (canvas px) so the drag aims at `c`: DRAG_LIFT below its centre. */
const fingerFor = (c: Cell): Point => ({ x: centre(c).x, y: centre(c).y + DRAG_LIFT });

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function tapAt(page: Page, p: Point): Promise<void> {
  const q = await toPage(page, p);
  await page.touchscreen.tap(q.x, q.y);
}

/**
 * A real touch drag from canvas point `from` to `to` in `steps` moves; runs
 * `during` with the finger still down at `to`, then lifts it.
 */
async function touchDrag(page: Page, client: CDPSession, from: Point, to: Point, during?: () => Promise<void>, steps = 10): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= steps; i++) {
    const x = a.x + ((b.x - a.x) * i) / steps;
    const y = a.y + ((b.y - a.y) * i) / steps;
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('touch drag from the bar: the ghost aims 48 canvas px above the finger and builds there', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  const finger = fingerFor(C75);
  // The finger sits on cell (7,7); the drag aims at (7,5). On the page the
  // lift is 48 canvas px times the fit scale 1024 / 960, 51.2 page px.
  expect(Math.floor(finger.y / 32)).toBe(7);
  const fingerPage = await toPage(page, finger);
  const targetPage = await toPage(page, centre(C75));
  expect(fingerPage.y - targetPage.y).toBeCloseTo((DRAG_LIFT * 1024) / 960, 2);

  await touchDrag(page, client, await rectCentre(page, 'bar:musketeer'), finger, async () => {
    const u = await ui(page);
    expect(u.isTouch).toBe(true);
    expect(u.dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: C75 });
  });
  const s = await state(page);
  expect(s.gold).toBe(50);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer', locked: false })]);
  expect(await ui(page)).toMatchObject({ pick: 'musketeer', dragging: null });
});

test('touch drag moves an unlocked tower; a locked one stays', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));

  // Press on the tower, drag so the lifted ghost aims at (9,5), release.
  await touchDrag(page, client, centre(C75), fingerFor(C95), async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: C95 });
  });
  let s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C95, locked: false })]);
  expect(s.gold).toBe(50);

  // After Start Wave the tower is locked: a drag does nothing.
  await api(page, (a) => a.startWave());
  await touchDrag(page, client, centre(C95), fingerFor(C75), async () => {
    expect((await ui(page)).dragging).toBeNull();
  });
  s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C95, locked: true })]);
});

test('touch drag moves a tower onto a buildable cell in the bottom row (finger over the HUD)', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  const BOTTOM: Cell = { col: 2, row: 14 };
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  const finger = fingerFor(BOTTOM);
  expect(finger.y).toBeGreaterThan(480); // the finger itself is over the HUD
  await touchDrag(page, client, centre(C75), finger, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: BOTTOM });
  });
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: BOTTOM, locked: false })]);
  expect(s.gold).toBe(50);
});

test('touch drag released with the finger on the build bar (aim off the map) builds nothing', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  await touchDrag(page, client, await rectCentre(page, 'bar:cannon'), { x: 480, y: 554 }, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'cannon', cell: null });
  });
  const s = await state(page);
  expect(s.towers).toEqual([]);
  expect(s.gold).toBe(100);
});

test('two-tap placement still works after a drag', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  await touchDrag(page, client, await rectCentre(page, 'bar:longbow'), fingerFor(C75));
  expect((await state(page)).towers).toHaveLength(1);

  // The pick stays (Longbow): tap (9,5) to arm, tap again to build.
  expect((await ui(page)).pick).toBe('longbow');
  await tapAt(page, centre(C95));
  expect(await ui(page)).toMatchObject({ armedCell: C95, hoverCell: C95 });
  expect((await state(page)).towers).toHaveLength(1);
  await tapAt(page, centre(C95));
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75 }), expect.objectContaining({ cell: C95, type: 'longbow' })]);
  expect(s.gold).toBe(20);
});

test('a tap on a bar button still toggles the pick', async ({ page }) => {
  await startGame(page);
  await tapAt(page, await rectCentre(page, 'bar:musketeer'));
  expect((await ui(page)).pick).toBe('musketeer');
  await tapAt(page, await rectCentre(page, 'bar:musketeer'));
  expect((await ui(page)).pick).toBeNull();
});
