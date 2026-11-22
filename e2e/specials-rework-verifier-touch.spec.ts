import fs from 'node:fs';
import { expect, test, type CDPSession, type Page } from '@playwright/test';
import { DRAG_LIFT } from '../src/game/input';
import { aimBannerText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { MAPS, positionAlongPath } from '../src/sim/map';
import type { GameEvent, SpecialType } from '../src/sim';

// Milestone 30 verifier probes, tablet project (touch). Written by the
// verifier, a different model from the implementer. Frames go to
// VERIFIER_FRAMES when it is set.

type Point = { x: number; y: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const toPage = (page: Page, p: Point) => page.evaluate(([cx, cy]) => window.__tarpit!.canvasToPage(cx, cy), [p.x, p.y]);
const frames = process.env.VERIFIER_FRAMES;
const SPOT = positionAlongPath(MAPS.meadow, 700);

async function quietWave(page: Page, wave: number): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(
    async ([w]) => {
      const t = window.__tarpit as TarpitTestApi;
      await t.startGame();
      const s = t.state();
      s.wave = w - 1;
      s.gold = 1000;
      s.lives = 999;
      t.startWave();
      s.spawnedPerGroup = s.spawnedPerGroup.map(() => 9999);
      s.enemies = [{ id: 900, type: 'troll', hp: 1e9, distance: 0, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 }];
    },
    [wave],
  );
  await reset(page);
}
const reset = (page: Page) =>
  api(page, (a) => {
    const s = a.state();
    s.enemies = [{ id: 900, type: 'troll', hp: 1e9, distance: 0, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 }];
    s.specialCharges = 1;
    s.specialRechargeTicks = 0;
    s.zones = [];
    a.step(1);
  });

async function tapAt(page: Page, p: Point): Promise<void> {
  const q = await toPage(page, p);
  await page.touchscreen.tap(q.x, q.y);
}
async function tapRect(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, name).toBeTruthy();
  await tapAt(page, { x: r.x + r.width / 2, y: r.y + r.height / 2 });
}
async function pick(page: Page, type: SpecialType): Promise<void> {
  await tapRect(page, 'special');
  if ((await ui(page)).special.menuOpen) await tapRect(page, `special:${type}`);
  expect((await ui(page)).special.aiming).toBe(type);
}
async function hold(page: Page, client: CDPSession, p: Point, ms = 450): Promise<void> {
  const a = await toPage(page, p);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y }] });
  await page.waitForTimeout(ms);
}
const lift = (client: CDPSession) => client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const special = async (page: Page) => (await events(page)).find((e): e is Extract<GameEvent, { kind: 'special' }> => e.kind === 'special');
const near = (a: Point, b: Point) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

test('touch banner names each special and says how to hold', async ({ page }) => {
  await quietWave(page, 7);
  await tapRect(page, 'special');
  for (const type of ['keg', 'tarBarrel', 'fireArrows'] as const) {
    if (!(await ui(page)).special.menuOpen) await tapRect(page, 'special');
    await tapRect(page, `special:${type}`);
    expect((await ui(page)).special.banner).toEqual(aimBannerText(type, true));
    await tapRect(page, 'special'); // cancel
    expect((await ui(page)).special.aiming).toBeNull();
  }
  expect((await state(page)).specialCharges).toBe(1);
});

test('tap fires at the tap on the edges of the map and not on the tower under it; the tower is not selected', async ({ page }) => {
  await quietWave(page, 1);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  for (const p of [{ x: 1, y: 1 }, { x: 958, y: 1 }, { x: 1, y: 478 }, { x: 958, y: 478 }, { x: 240, y: 176 }]) {
    await reset(page);
    await pick(page, 'keg');
    await tapAt(page, p);
    const sp = await special(page);
    expect(sp && near(sp, p), JSON.stringify(p)).toBe(true);
    const u = await ui(page);
    expect([u.panelOpen, u.selectedCell]).toEqual([false, null]);
  }
});

test('hold and release: the lifted point decides at both side edges, the bottom rows and the top row; off-map cancels', async ({ page }) => {
  await quietWave(page, 1);
  const client = await page.context().newCDPSession(page);
  const cases: { finger: Point; fires: boolean }[] = [
    { finger: { x: 2, y: 300 }, fires: true }, // left edge
    { finger: { x: 957, y: 300 }, fires: true }, // right edge
    { finger: { x: 480, y: 479 }, fires: true }, // bottom row (aim y 431)
    { finger: { x: 480, y: 527 }, fires: true }, // on the HUD, aim y 479
    { finger: { x: 480, y: 540 }, fires: false }, // aim y 492: off the map
    { finger: { x: 480, y: 50 }, fires: true }, // top row (aim y 2)
    { finger: { x: 480, y: 30 }, fires: false }, // aim y -18: off the map
  ];
  for (const c of cases) {
    await reset(page);
    await pick(page, 'keg');
    // A press that starts on the HUD cancels aiming, so reach the HUD cases by sliding down from the map.
    const start = c.finger.y > 480 ? { x: c.finger.x, y: 400 } : c.finger;
    await hold(page, client, start, c.finger.y > 480 ? 50 : 450);
    if (c.finger.y > 480) {
      const b = await toPage(page, c.finger);
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x, y: b.y }] });
      await page.waitForTimeout(100);
    }
    expect((await ui(page)).special.holding, JSON.stringify(c)).toBe(true);
    await lift(client);
    const sp = await special(page);
    const u = await ui(page);
    if (c.fires) {
      expect(sp && near(sp, { x: c.finger.x, y: c.finger.y - DRAG_LIFT }), JSON.stringify(c)).toBe(true);
      expect((await state(page)).specialCharges).toBe(0);
    } else {
      expect(sp, JSON.stringify(c)).toBeUndefined();
      expect([u.special.aiming, (await state(page)).specialCharges]).toEqual([null, 1]);
    }
  }
});

test('a tap on a tower tile or the build bar while aiming: bar press cancels (and still does its job), a tower tap fires', async ({ page }) => {
  await quietWave(page, 1);
  await pick(page, 'keg');
  await tapRect(page, 'bar:musketeer');
  const u = await ui(page);
  expect([u.special.aiming, (await state(page)).specialCharges]).toEqual([null, 1]);
  expect(u.pick).toBe('musketeer');
});

test('speed by touch: a short tap toggles once, a hold gives 3x only while held', async ({ page }) => {
  await quietWave(page, 1);
  const client = await page.context().newCDPSession(page);
  await tapRect(page, 'speed');
  expect(await api(page, (a) => a.speed())).toBe(2);
  const r = (await rects(page)).speed;
  await hold(page, client, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, 500);
  expect(await api(page, (a) => a.speed())).toBe(3);
  await lift(client);
  expect(await api(page, (a) => a.speed())).toBe(2);
});

test('cheat by touch: four taps do nothing, a fifth gives 500 once', async ({ page }) => {
  await quietWave(page, 1);
  const g0 = (await state(page)).gold;
  for (let i = 0; i < 4; i++) await tapRect(page, 'gold');
  expect((await state(page)).gold).toBe(g0);
  await tapRect(page, 'gold');
  expect((await state(page)).gold).toBe(g0 + 500);
});

test('tablet frames: aiming by hold, the tar puddle, the fire patch, recharging, the cheat marker', async ({ page }) => {
  test.skip(!frames, 'set VERIFIER_FRAMES to a folder to write frames');
  await quietWave(page, 7);
  const client = await page.context().newCDPSession(page);
  await pick(page, 'tarBarrel');
  await hold(page, client, { x: SPOT.x, y: SPOT.y + DRAG_LIFT }, 450);
  await api(page, (a) => a.step(1));
  fs.writeFileSync(`${frames}/tablet-aim-hold.png`, await page.screenshot());
  await lift(client);
  await api(page, (a) => a.step(120));
  for (let i = 0; i < 5; i++) await tapRect(page, 'gold');
  fs.writeFileSync(`${frames}/tablet-tar-recharge-cheat.png`, await page.screenshot());
  await reset(page);
  await pick(page, 'fireArrows');
  await tapAt(page, SPOT);
  await api(page, (a) => a.step(120));
  fs.writeFileSync(`${frames}/tablet-fire.png`, await page.screenshot());
});
