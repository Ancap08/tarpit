import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { DRAG_LIFT } from '../src/game/input';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { Enemy, GameEvent } from '../src/sim';
import { MAP, positionAlongPath } from '../src/sim/map';

// Milestone 25b, tablet project (playwright.config.ts TABLET_SPECS matches
// touch.spec.ts): a Powder Keg fired by touch, by tap-tap and by a drag
// with the lifted aim. Drags go through CDP Input.dispatchTouchEvent as in
// touch-drag.spec.ts; every point is a canvas point mapped with
// canvasToPage() (the canvas is fitted at 1024 / 960 with letterboxing).
// A touch drag aims DRAG_LIFT (48) canvas px above the finger.

type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const pos = (e: Enemy): Point => positionAlongPath(MAP, e.distance);
const specialOf = (ev: GameEvent[]) => ev.find((e) => e.kind === 'special');

/** Wave 1 started and 600 ticks in (Goblins on the path). */
async function startWave1(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.startWave();
    t.step(600);
  });
}

async function tapAt(page: Page, p: Point): Promise<void> {
  const q = await toPage(page, p);
  await page.touchscreen.tap(q.x, q.y);
}

async function tapRect(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await tapAt(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
}

/** A real touch drag from canvas point `from` to `to`; runs `during` with the finger still down at `to`, then lifts it. */
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

test('tap-tap: the first tap on the map places the aim circle, a second tap on it fires the Powder Keg', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: 'keg', aimPoint: null });

  const goblin = (await state(page)).enemies[0];
  const at = pos(goblin);
  const tap = { x: Math.round(at.x), y: Math.round(at.y) };
  await tapAt(page, tap);
  let u = await ui(page);
  expect(u.isTouch).toBe(true);
  expect(u.special.aiming).toBe('keg');
  const placed = u.special.aimPoint!;
  expect(Math.abs(placed.x - tap.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(placed.y - tap.y)).toBeLessThanOrEqual(1);
  expect(specialOf(await events(page))).toBeUndefined();

  await tapAt(page, tap);
  const ev = await events(page);
  expect(specialOf(ev)).toMatchObject({ type: 'keg', x: placed.x, y: placed.y });
  expect(ev.some((e) => e.kind === 'kill' && e.enemyId === goblin.id && e.cause === 'special')).toBe(true);
  u = await ui(page);
  expect(u.special).toMatchObject({ charges: 0, aiming: null, aimPoint: null });
});

test('drag: the aim circle is 48 canvas px above the finger and the release fires there', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const goblin = (await state(page)).enemies[0];
  const at = pos(goblin);
  const finger = { x: Math.round(at.x), y: Math.round(at.y) + DRAG_LIFT };
  await touchDrag(page, client, { x: 600, y: 300 }, finger, async () => {
    const u = await ui(page);
    expect(u.special.aiming).toBe('keg');
    const aim = u.special.aimPoint!;
    // Page px map back to canvas px through the fit, so allow a pixel.
    expect(Math.abs(aim.x - finger.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(finger.y - aim.y - DRAG_LIFT)).toBeLessThanOrEqual(1);
    expect(specialOf(await events(page))).toBeUndefined();
  });
  const ev = await events(page);
  const sp = specialOf(ev);
  expect(sp).toMatchObject({ type: 'keg' });
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(Math.abs(sp.y - (at.y as number))).toBeLessThanOrEqual(1);
  expect(ev.some((e) => e.kind === 'kill' && e.enemyId === goblin.id && e.cause === 'special')).toBe(true);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });
});

test('drag released with the finger over the HUD and the aim on the map fires on the map, pressing no button', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const speed = (await rects(page)).speed;
  const finger = { x: speed.x + speed.width / 2, y: speed.y + speed.height / 2 };
  expect(finger.y - DRAG_LIFT).toBeLessThan(480); // the aim point is on the map
  await touchDrag(page, client, { x: 600, y: 300 }, finger);
  const sp = specialOf(await events(page));
  expect(sp).toMatchObject({ type: 'keg' });
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(Math.abs(sp.x - finger.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(sp.y - (finger.y - DRAG_LIFT))).toBeLessThanOrEqual(1);
  expect(sp.y).toBeLessThan(480);
  expect(await api(page, (a) => a.speed())).toBe(1);
  expect((await ui(page)).special.charges).toBe(0);
});

test('a tap on the HUD cancels touch aiming and keeps the charge', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  await tapAt(page, { x: 500, y: 200 });
  const u = await ui(page);
  expect(u.special.aiming).toBe('keg');
  expect(u.special.aimPoint!.x).toBeCloseTo(500, 2);
  expect(u.special.aimPoint!.y).toBeCloseTo(200, 2);
  await tapAt(page, { x: 300, y: 505 });
  expect((await ui(page)).special).toMatchObject({ aiming: null, aimPoint: null, charges: 1 });
});
