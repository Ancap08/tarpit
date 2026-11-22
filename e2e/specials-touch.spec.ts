import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { DRAG_LIFT } from '../src/game/input';
import type { TarpitTestApi } from '../src/game/testGlobal';
import type { Enemy, GameEvent } from '../src/sim';
import { MAPS, positionAlongPath } from '../src/sim/map';

// Milestone 25b, reworked in milestone 30, tablet project
// (playwright.config.ts TABLET_SPECS matches touch.spec.ts): a special
// fired by touch, by a tap (at the tap) and by a hold (lifted aim, fired on
// release). Drags go through CDP Input.dispatchTouchEvent as in
// touch-drag.spec.ts; every point is a canvas point mapped with
// canvasToPage() (the canvas is fitted at 1024 / 960 with letterboxing).
// A hold aims DRAG_LIFT (48) canvas px above the finger.

type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const pos = (e: Enemy): Point => positionAlongPath(MAPS.meadow, e.distance);
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

/** Put one finger down at canvas point `p`, wait `ms`, run `during`, then lift it there. */
async function touchHold(page: Page, client: CDPSession, p: Point, ms: number, during?: () => Promise<void>): Promise<void> {
  const a = await toPage(page, p);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await page.waitForTimeout(ms);
  if (during) await during();
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

test('a tap on the map fires at once at the tap point, with the touch banner shown before', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: 'keg', aimPoint: null });
  const goblin = (await state(page)).enemies[0];
  const at = pos(goblin);
  const tap = { x: Math.round(at.x), y: Math.round(at.y) };
  await tapAt(page, tap);
  const ev = await events(page);
  const sp = specialOf(ev);
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(near(sp, tap)).toBe(true);
  expect(ev.some((e) => e.kind === 'kill' && e.enemyId === goblin.id && e.cause === 'special')).toBe(true);
  const u = await ui(page);
  expect(u.isTouch).toBe(true);
  expect(u.special).toMatchObject({ charges: 0, aiming: null, aimPoint: null, banner: null });
  expect(u.special.labels).toEqual([expect.objectContaining({ text: '1 hit' })]);
});

test('the banner on touch says to tap, and how to hold', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  // isTouch is set by the tap on the Special button's press.
  expect((await ui(page)).special.banner).toEqual({ main: 'Tap the trail to throw the Powder Keg', hint: 'Or hold to aim and lift to let go. Special again cancels.' });
});

test('a tap in the bottom row of the map fires there', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  await tapAt(page, { x: 500, y: 474 });
  const sp = specialOf(await events(page));
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(near(sp, { x: 500, y: 474 })).toBe(true);
  expect((await ui(page)).special.charges).toBe(0);
});

test('hold without moving: after 300 ms the circle shows 48 px above the finger and the release fires there', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const finger = { x: 400, y: 300 };
  await touchHold(page, client, finger, 450, async () => {
    const u = await ui(page);
    expect(u.special.holding).toBe(true);
    expect(near(u.special.aimPoint!, { x: finger.x, y: finger.y - DRAG_LIFT })).toBe(true);
    expect(specialOf(await events(page))).toBeUndefined();
  });
  const sp = specialOf(await events(page));
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(near(sp, { x: finger.x, y: finger.y - DRAG_LIFT })).toBe(true);
});

test('hold and slide: the circle follows 48 px above the finger and the release fires there', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const goblin = (await state(page)).enemies[0];
  const at = pos(goblin);
  const finger = { x: Math.round(at.x), y: Math.round(at.y) + DRAG_LIFT };
  await touchDrag(page, client, { x: 600, y: 300 }, finger, async () => {
    const u = await ui(page);
    expect(u.special.aiming).toBe('keg');
    expect(near(u.special.aimPoint!, { x: finger.x, y: finger.y - DRAG_LIFT })).toBe(true);
    expect(specialOf(await events(page))).toBeUndefined();
  });
  const ev = await events(page);
  const sp = specialOf(ev);
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(Math.abs(sp.y - at.y)).toBeLessThanOrEqual(1);
  expect(ev.some((e) => e.kind === 'kill' && e.enemyId === goblin.id && e.cause === 'special')).toBe(true);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });
});

// Follow-up: as for tower drags, the lifted point decides. A finger on the
// HUD aims at the map's bottom rows and fires there; buttons under the
// finger are not pressed.
test('hold and release with the finger on the HUD fires on a bottom-row target 48 px above it', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const target = { x: 500, y: 474 }; // the map's bottom row (y 448..480)
  const finger = { x: target.x, y: target.y + DRAG_LIFT };
  expect(finger.y).toBeGreaterThan(480); // the finger is on the HUD
  await touchDrag(page, client, { x: 500, y: 300 }, finger, async () => {
    const u = await ui(page);
    expect(u.special.holding).toBe(true);
    expect(near(u.special.aimPoint!, target)).toBe(true);
  });
  const sp = specialOf(await events(page));
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(near(sp, target)).toBe(true);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });
});

test('a hold released with the finger on the speed button fires 48 px above it and presses nothing', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'special');
  const speed = (await rects(page)).speed;
  const finger = { x: speed.x + speed.width / 2, y: speed.y + speed.height / 2 };
  await touchDrag(page, client, { x: 600, y: 300 }, finger);
  const sp = specialOf(await events(page));
  if (sp?.kind !== 'special') throw new Error('no special event');
  expect(near(sp, { x: finger.x, y: finger.y - DRAG_LIFT })).toBe(true);
  expect(await api(page, (a) => a.speed())).toBe(1);
});

test('a hold released with the finger on the Special button, or with the lifted point off the map, cancels and spends nothing', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  const r = await rects(page);
  await tapRect(page, 'special');
  await touchDrag(page, client, { x: 600, y: 300 }, { x: r.special.x + r.special.width / 2, y: r.special.y + r.special.height / 2 });
  expect(specialOf(await events(page))).toBeUndefined();
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });
  await tapRect(page, 'special');
  const bar = r['bar:longbow'];
  await touchDrag(page, client, { x: 300, y: 300 }, { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 });
  expect(specialOf(await events(page))).toBeUndefined();
  const u = await ui(page);
  expect(u.pick).toBeNull();
  expect(u.special).toMatchObject({ aiming: null, charges: 1 });
});

test('a tap on the HUD and a tap on Special again cancel touch aiming and keep the charge', async ({ page }) => {
  await startWave1(page);
  await tapRect(page, 'special');
  await tapAt(page, { x: 300, y: 505 });
  expect((await ui(page)).special).toMatchObject({ aiming: null, aimPoint: null, charges: 1 });
  await tapRect(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  await tapRect(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });
});

test('speed by touch: a tap toggles to 2x; a hold runs 3x and the release goes back to 2x', async ({ page }) => {
  await startWave1(page);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(2);
  const r = (await rects(page)).speed;
  await touchHold(page, client, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 450, async () => {
    expect(await api(page, (a) => a.speed())).toBe(3);
    expect((await api(page, (a) => a.hudText())).speed).toBe('3x');
  });
  expect(await api(page, (a) => a.speed())).toBe(2);
});

test('gold cheat by touch: five quick taps on Gold add 500', async ({ page }) => {
  await startWave1(page);
  const gold = (await state(page)).gold;
  for (let i = 0; i < 5; i++) await tapRect(page, 'gold');
  expect((await state(page)).gold).toBe(gold + 500);
  expect((await api(page, (a) => a.hudText())).cheat).toBe('cheat used');
});
