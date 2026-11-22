import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { aimBannerText, rechargeText, specialResultText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { MAPS, positionAlongPath } from '../src/sim/map';
import { SPECIAL_RECHARGE_TICKS } from '../src/sim/specials';
import type { GameEvent, SpecialType } from '../src/sim';

// Milestone 30 verifier probes, desktop (mouse). Written by the verifier, a
// different model from the implementer. Frames go to VERIFIER_FRAMES when it
// is set. Time is frozen (?test=1); effects age by simulation tick.

type Point = { x: number; y: number };
const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const hud = (page: Page) => api(page, (a) => a.hudText());
const frames = process.env.VERIFIER_FRAMES;

/** A started wave `wave` with a lone, very tough Troll at the start and no more spawns, so the wave never clears. */
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
      s.nextEnemyId = 1000;
      t.step(1);
    },
    [wave],
  );
}

/** Put the lone Troll back at the start, make the charge ready and drop zones (test setup between shots). */
const reset = (page: Page) =>
  api(page, (a) => {
    const s = a.state();
    s.enemies = [{ id: 900, type: 'troll', hp: 1e9, distance: 0, slow: 0, slowTicksLeft: 0, burnDps: 0, burnTicksLeft: 0 }];
    s.specialCharges = 1;
    s.specialRechargeTicks = 0;
    s.zones = [];
    a.step(1);
  });

const SPOT = positionAlongPath(MAPS.meadow, 700);

async function clickRect(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, name).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

async function pick(page: Page, type: SpecialType): Promise<void> {
  await clickRect(page, 'special');
  if ((await ui(page)).special.menuOpen) await clickRect(page, `special:${type}`);
  expect((await ui(page)).special.aiming).toBe(type);
}

const special = async (page: Page) => (await events(page)).find((e): e is Extract<GameEvent, { kind: 'special' }> => e.kind === 'special');
const shot = (page: Page, p: Point, half = 130) =>
  page.screenshot({ clip: { x: Math.max(0, p.x - half), y: Math.max(0, p.y - half), width: half * 2, height: Math.min(half * 2, 480 - Math.max(0, p.y - half)) } });

test('aim banner names the right special; the unlocked popup lists them; text comes from names.ts', async ({ page }) => {
  await quietWave(page, 7);
  await clickRect(page, 'special');
  expect((await ui(page)).special.menuOpen).toBe(true);
  expect((await ui(page)).special.unlocked).toEqual(['keg', 'tarBarrel', 'fireArrows']);
  for (const type of ['keg', 'tarBarrel', 'fireArrows'] as const) {
    if (!(await ui(page)).special.menuOpen) await clickRect(page, 'special');
    await clickRect(page, `special:${type}`);
    expect((await ui(page)).special.banner).toEqual(aimBannerText(type, false));
    await page.keyboard.press('Escape');
    expect((await ui(page)).special).toMatchObject({ aiming: null, banner: null });
  }
});

test('mouse: click fires at the click, including the corners of the map; nothing is built or selected', async ({ page }) => {
  await quietWave(page, 1);
  await api(page, (a) => (a.state().specialCharges = 1));
  const corners: Point[] = [
    { x: 0, y: 0 },
    { x: 960, y: 0 },
    { x: 0, y: 479 },
    { x: 960, y: 479 },
    { x: 480, y: 478 },
    { x: 1, y: 240 },
    { x: 959, y: 240 },
  ];
  for (const p of corners) {
    await pick(page, 'keg');
    const towers = (await state(page)).towers.length;
    await page.mouse.click(Math.min(p.x, 959), p.y);
    const ev = await special(page);
    expect(ev, JSON.stringify(p)).toMatchObject({ x: Math.min(p.x, 959), y: p.y });
    expect((await state(page)).towers.length).toBe(towers);
    expect((await ui(page)).panelOpen).toBe(false);
    await reset(page);
  }
});

test('a click on a tower while aiming fires and does not select it; with a build pick active the pick is dropped and nothing is built', async ({ page }) => {
  await quietWave(page, 1);
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  const gold = (await state(page)).gold;
  await clickRect(page, 'bar:longbow');
  await pick(page, 'keg');
  expect((await ui(page)).pick).toBeNull();
  await page.mouse.click(7 * 32 + 16, 5 * 32 + 16);
  expect(await special(page)).toMatchObject({ type: 'keg', x: 240, y: 176 });
  const u = await ui(page);
  expect([u.pick, u.selectedCell, u.panelOpen]).toEqual([null, null, false]);
  expect((await state(page)).gold).toBe(gold);
  expect((await state(page)).towers).toHaveLength(1);
});

test('cancel by Special again, Escape, a click on the HUD and the speed button spends nothing; the charge stays ready', async ({ page }) => {
  await quietWave(page, 1);
  const spent = async () => (await state(page)).specialCharges;
  await pick(page, 'keg');
  await clickRect(page, 'special');
  expect((await ui(page)).special.aiming).toBeNull();
  expect(await spent()).toBe(1);
  await pick(page, 'keg');
  await page.keyboard.press('Escape');
  expect((await ui(page)).special.aiming).toBeNull();
  await pick(page, 'keg');
  await page.mouse.click(300, 560); // empty HUD spot
  expect((await ui(page)).special.aiming).toBeNull();
  expect(await spent()).toBe(1);
  expect((await events(page)).some((e) => e.kind === 'special')).toBe(false);
  await pick(page, 'keg');
  await clickRect(page, 'speed');
  expect((await ui(page)).special.aiming).toBeNull();
  expect(await spent()).toBe(1);
  expect(await api(page, (a) => a.speed())).toBe(2); // the HUD press still did its job
});

test('a special at empty ground says Missed; one on the Troll says "1 hit"; labels come from names.ts', async ({ page }) => {
  await quietWave(page, 1);
  await pick(page, 'keg');
  await page.mouse.click(900, 440);
  expect(await special(page)).toMatchObject({ hits: 0 });
  expect((await ui(page)).special.labels.map((l) => l.text)).toEqual([specialResultText(0)]);
  expect(specialResultText(0)).toBe('Missed');
  await reset(page);
  const troll = await api(page, (a) => a.state().enemies[0]);
  const at = positionAlongPath(MAPS.meadow, troll.distance);
  await pick(page, 'keg');
  await page.mouse.click(Math.round(at.x), Math.round(at.y));
  expect((await ui(page)).special.labels.map((l) => l.text)).toContain(specialResultText(1));
});

test('recharge: button counts down from "Wait 20s", cannot fire at 1199 ticks, fires at 1200; second special in the same wave', async ({ page }) => {
  await quietWave(page, 1);
  await pick(page, 'keg');
  await page.mouse.click(900, 440);
  expect((await hud(page)).special).toBe(rechargeText(SPECIAL_RECHARGE_TICKS, 60));
  await api(page, (a) => a.step(600));
  expect((await hud(page)).special).toBe('Wait 10s');
  await api(page, (a) => a.step(599));
  await clickRect(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, ready: false, rechargeTicks: 1 });
  await api(page, (a) => a.step(1));
  expect((await hud(page)).special).toBe('Special');
  await pick(page, 'keg');
  await page.mouse.click(900, 440);
  expect((await state(page)).specialCharges).toBe(0);
});

test('a keg leaves a scorch that fades; the tar puddle and fire patch are drawn for the zone life and gone after', async ({ page }) => {
  await quietWave(page, 7);
  await page.mouse.move(480, 560);
  const base = await shot(page, SPOT);
  for (const type of ['keg', 'tarBarrel', 'fireArrows'] as const) {
    await reset(page);
    await pick(page, type);
    await page.mouse.click(Math.round(SPOT.x), Math.round(SPOT.y));
    await page.mouse.move(480, 560);
    await api(page, (a) => a.step(1));
    const just = await shot(page, SPOT);
    expect(Buffer.compare(just, base), `${type} just landed`).not.toBe(0);
    if (frames) fs.writeFileSync(`${frames}/${type}-landed.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 960, height: 580 } }));
    if (type === 'keg') {
      await api(page, (a) => a.step(100));
      expect(Buffer.compare(await shot(page, SPOT), base), 'keg scorch at 101 ticks').not.toBe(0);
      await api(page, (a) => a.step(30));
      expect(Buffer.compare(await shot(page, SPOT), base), 'keg scorch gone by 131 ticks').toBe(0);
    } else {
      await api(page, (a) => a.step(240));
      expect(Buffer.compare(await shot(page, SPOT), base), `${type} at 241`).not.toBe(0);
      if (frames) fs.writeFileSync(`${frames}/${type}-mid.png`, await page.screenshot({ clip: { x: 0, y: 0, width: 960, height: 580 } }));
      await api(page, (a) => a.step(230)); // 471 ticks: faded but still there
      expect((await state(page)).zones.length).toBe(1);
      expect(Buffer.compare(await shot(page, SPOT), base), `${type} at 471 (fading)`).not.toBe(0);
      await api(page, (a) => a.step(10)); // 481
      expect((await state(page)).zones.length).toBe(0);
      expect(Buffer.compare(await shot(page, SPOT), base), `${type} gone after its life`).toBe(0);
    }
  }
});

test('speed: short press toggles once, hold gives 3x only while held; holding through a win leaves no stuck 3x', async ({ page }) => {
  await quietWave(page, 1);
  const r = (await rects(page)).speed;
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await page.mouse.up();
  expect(await api(page, (a) => a.speed())).toBe(2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(500);
  expect(await api(page, (a) => a.speed())).toBe(3);
  // Win while holding: kill the troll and run to the end.
  await api(page, (a) => {
    const s = a.state();
    s.wave = 10;
    s.enemies = [];
    s.spawnedPerGroup = Array(12).fill(9999);
    a.step(3);
  });
  expect((await state(page)).phase).toBe('won');
  await page.mouse.up();
  expect(await api(page, (a) => a.speed())).toBe(2);
});

test('cheat: ten quick taps give two grants (+1000); the marker shows; refused on the win screen', async ({ page }) => {
  await quietWave(page, 1);
  const g0 = (await state(page)).gold;
  const r = (await rects(page)).gold;
  for (let i = 0; i < 10; i++) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  const s = await state(page);
  expect([s.gold - g0, s.cheated]).toEqual([1000, true]);
  expect((await hud(page)).cheat).toBe('cheat used');
  await api(page, (a) => {
    const st = a.state();
    st.wave = 10;
    st.enemies = [];
    st.spawnedPerGroup = Array(12).fill(9999);
    a.step(3);
  });
  expect((await state(page)).phase).toBe('won');
  const gold = (await state(page)).gold;
  for (let i = 0; i < 5; i++) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  expect((await state(page)).gold).toBe(gold);
});

test('cheat in setup, mid-wave and in endless adds 500; the best is untouched by the cheated run', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await api(page, (a) => a.startGame());
  const r = (await rects(page)).gold;
  const tap = async () => {
    for (let i = 0; i < 5; i++) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  };
  let g = (await state(page)).gold;
  await tap();
  expect((await state(page)).gold - g).toBe(500);
  await api(page, (a) => a.startWave());
  g = (await state(page)).gold;
  await page.waitForTimeout(2100);
  await tap();
  expect((await state(page)).gold - g).toBe(500);
  expect(await api(page, (a) => a.bestScore('normal'))).toBeNull();
  await api(page, (a) => a.runScript('comboBuild', 10));
  await api(page, (a) => a.startWave());
  await api(page, (a) => a.step(8000));
  // The cheated game's progress is not stored.
  expect(await api(page, (a) => a.bestScore('normal'))).toBeNull();
});

test('the spots the owner will look at: frames of aiming, the button recharging and the cheat marker', async ({ page }) => {
  test.skip(!frames, 'set VERIFIER_FRAMES to a folder to write frames');
  await quietWave(page, 7);
  await api(page, (a) => a.buildAt(8, 5, 'musketeer'));
  await clickRect(page, 'special');
  await clickRect(page, 'special:tarBarrel');
  await page.mouse.move(Math.round(SPOT.x), Math.round(SPOT.y));
  await api(page, (a) => a.step(1));
  fs.writeFileSync(`${frames}/aim-tar.png`, await page.screenshot());
  await page.mouse.click(Math.round(SPOT.x), Math.round(SPOT.y));
  await page.mouse.move(480, 560);
  await api(page, (a) => a.step(300));
  const r = (await rects(page)).gold;
  for (let i = 0; i < 5; i++) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  await page.mouse.move(480, 575);
  fs.writeFileSync(`${frames}/recharging-cheat.png`, await page.screenshot());
});

// Re-verify of commit 819476f (lost 3x release): the new handlers must not end a real hold or drag.
test('a 3x hold continues when the pointer leaves the canvas with the button down and comes back', async ({ page }) => {
  await quietWave(page, 1);
  const r = (await rects(page)).speed;
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  expect(await api(page, (a) => a.speed())).toBe(3);
  await page.mouse.move(c.x, 900, { steps: 4 }); // below the window, button still down
  await page.waitForTimeout(100);
  expect(await api(page, (a) => a.speed())).toBe(3);
  await page.mouse.move(c.x - 30, c.y, { steps: 4 });
  await page.waitForTimeout(100);
  expect(await api(page, (a) => a.speed())).toBe(3);
  await page.mouse.up();
  expect(await api(page, (a) => a.speed())).toBe(1);
});

test('a tower drag that leaves the canvas and comes back with the button down still places the tower', async ({ page }) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await api(page, (a) => a.startGame());
  const bar = (await rects(page))['bar:musketeer'];
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(300, 300, { steps: 5 });
  await page.mouse.move(300, 900, { steps: 5 }); // out of the window, button down
  await page.mouse.move(7 * 32 + 16, 5 * 32 + 16, { steps: 8 }); // back onto cell (7,5)
  await page.mouse.up();
  expect((await state(page)).towers.map((t) => [t.cell.col, t.cell.row, t.type])).toEqual([[7, 5, 'musketeer']]);
});
