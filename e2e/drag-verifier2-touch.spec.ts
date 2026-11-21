import { expect, test, type CDPSession, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Verifier probes for the milestone 25a follow-ups, tablet project (real
// touch through CDP). On touch the aim point 48 canvas px above the finger
// decides, so the finger may be over the HUD; a release there must build or
// move on the map and must not also press the HUD button under the finger.

type Cell = { col: number; row: number };
type Point = { x: number; y: number };
const C75: Cell = { col: 7, row: 5 };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const centre = (c: Cell): Point => ({ x: c.col * 32 + 16, y: c.row * 32 + 16 });

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

async function rectCentre(page: Page, name: string): Promise<Point> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, name).toBeTruthy();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

async function touchDrag(page: Page, client: CDPSession, from: Point, to: Point, during?: () => Promise<void>): Promise<void> {
  const a = await toPage(page, from);
  const b = await toPage(page, to);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 10; i++) {
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + ((b.x - a.x) * i) / 10, y: a.y + ((b.y - a.y) * i) / 10 }] });
  }
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('a bar drag released with the finger on Start Wave builds under the aim point and does not start the wave', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  const sw = await rectCentre(page, 'startWave');
  const aim: Cell = { col: Math.floor(sw.x / 32), row: Math.floor((sw.y - 48) / 32) };
  expect(aim.row).toBeGreaterThanOrEqual(13);
  await touchDrag(page, client, await rectCentre(page, 'bar:musketeer'), sw, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: aim });
  });
  let s = await state(page);
  expect(s.phase).toBe('setup');
  expect(s.wave).toBe(0);
  expect(s.towers).toEqual([expect.objectContaining({ cell: aim, type: 'musketeer', locked: false, unlockedSpend: 50 })]);
  expect(s.gold).toBe(50);

  // The same over the speed button: the speed stays 1x.
  const speed = await rectCentre(page, 'speed');
  await touchDrag(page, client, await rectCentre(page, 'bar:longbow'), speed);
  s = await state(page);
  expect(s.towers).toHaveLength(2);
  expect(await api(page, (a) => a.speed())).toBe(1);
  expect(s.phase).toBe('setup');

  // A plain tap on Start Wave still starts the wave.
  const q = await toPage(page, sw);
  await page.touchscreen.tap(q.x, q.y);
  expect((await state(page)).phase).toBe('wave');
});

test('a tower drag released with the finger on Start Wave moves the tower and does not start the wave', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  const sw = await rectCentre(page, 'startWave');
  const aim: Cell = { col: Math.floor(sw.x / 32), row: Math.floor((sw.y - 48) / 32) };
  await touchDrag(page, client, centre(C75), sw, async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: C75, cell: aim });
  });
  let s = await state(page);
  expect(s.phase).toBe('setup');
  expect(s.towers).toEqual([expect.objectContaining({ cell: aim, locked: false })]);
  expect(s.gold).toBe(50);

  // Finger on the build bar: the aim point is off the map, the move cancels and no pick is made.
  await touchDrag(page, client, centre(aim), await rectCentre(page, 'bar:cannon'), async () => {
    expect((await ui(page)).dragging).toEqual({ kind: 'move', tower: 'musketeer', from: aim, cell: null });
  });
  s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: aim })]);
  expect(await ui(page)).toMatchObject({ dragging: null, pick: null });
});

test('touch moves carry no mouse buttons, and the lost-button guard leaves a touch drag alone', async ({ page }) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  const from = await rectCentre(page, 'bar:musketeer');
  // Thirty slow moves across the map: the drag stays live at every step.
  const a = await toPage(page, from);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  for (let i = 1; i <= 30; i++) {
    const p = await toPage(page, { x: from.x + i * 10, y: from.y - i * 10 });
    await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] });
    if (i >= 2) expect((await ui(page)).dragging, `move ${i}`).toMatchObject({ kind: 'place', tower: 'musketeer' });
  }
  const last = await toPage(page, { x: 240, y: 224 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: last.x, y: last.y }] });
  expect((await ui(page)).dragging).toEqual({ kind: 'place', tower: 'musketeer', cell: C75 });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const s = await state(page);
  expect(s.towers).toEqual([expect.objectContaining({ cell: C75, type: 'musketeer' })]);
  expect(s.gold).toBe(50);
});
