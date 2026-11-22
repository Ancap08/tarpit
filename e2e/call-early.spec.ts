import { expect, test, type Page } from '@playwright/test';
import { callEarlyLabel, killsLabel } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { lastSpawnTick } from '../src/sim/game';

// Milestone 25c, desktop project (real mouse): the Start Wave button calls
// the next wave early once every enemy of the current wave has spawned, and
// reads "Call next  +N" with the current bonus; the tower panel shows the
// tower's kill count. Time is frozen (?test=1): the test steps it.

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const hud = (page: Page) => api(page, (a) => a.hudText());

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().lives = 1000; // survive a towerless wave
  });
}

async function click(page: Page, name: string): Promise<void> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

test('Start Wave turns into "Call next  +N" after the last spawn and calls wave 2 with the bonus', async ({ page }) => {
  await startGame(page);
  expect((await ui(page)).callEarly).toEqual({ available: false, bonus: 0 });
  expect((await hud(page)).startWave).toBe('Start Wave');
  await click(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 1 });
  // Still spawning: the button reads Start Wave and is greyed; a click does nothing.
  await api(page, (a) => a.step(10));
  expect((await ui(page)).callEarly).toEqual({ available: false, bonus: 0 });
  expect((await hud(page)).startWave).toBe('Start Wave');
  await click(page, 'startWave');
  expect((await state(page)).wave).toBe(1);
  // Run to just after wave 1's last spawn (waveTick = lastSpawnTick + 1), then 61 more ticks: 19 s left.
  const last = lastSpawnTick(1);
  await page.evaluate((n) => (window.__tarpit as TarpitTestApi).step(n), last + 1 - 10 + 61);
  expect((await ui(page)).callEarly).toEqual({ available: true, bonus: 19 });
  expect((await hud(page)).startWave).toBe(callEarlyLabel(19));
  const before = await state(page);
  expect(before.enemies.length).toBeGreaterThan(0);
  await click(page, 'startWave');
  const after = await state(page);
  expect(after).toMatchObject({ phase: 'wave', wave: 2, waveTick: 0, specialCharges: 1, gold: before.gold + 25 + 19 });
  expect(after.enemies.map((e) => e.id)).toEqual(before.enemies.map((e) => e.id));
  expect((await api(page, (a) => a.events())).filter((e) => e.kind === 'earlyCall')).toEqual([{ kind: 'earlyCall', wave: 2, bonus: 19 }]);
  // Wave 2 is spawning now: back to a greyed Start Wave.
  expect((await ui(page)).callEarly).toEqual({ available: false, bonus: 0 });
  expect((await hud(page)).startWave).toBe('Start Wave');
});

test('the tower panel shows the kill count, "Kills N", and it grows as the tower kills', async ({ page }) => {
  await startGame(page);
  const cell = { col: 7, row: 5 };
  expect(await page.evaluate((c) => (window.__tarpit as TarpitTestApi).buildAt(c.col, c.row, 'musketeer').ok, cell)).toBe(true);
  await page.mouse.click(cell.col * 32 + 16, cell.row * 32 + 16);
  expect(await ui(page)).toMatchObject({ panelOpen: true, killsLabel: killsLabel(0) });
  await api(page, (a) => a.startWave());
  await api(page, (a) => a.step(900));
  const kills = (await state(page)).towers[0].kills;
  expect(kills).toBeGreaterThan(0);
  expect((await ui(page)).killsLabel).toBe(killsLabel(kills));
  // The line sits above the Upgrade button, inside the panel.
  const r = await api(page, (a) => a.uiRects());
  expect(r['panel:upgrade'].y).toBeGreaterThan(r['panel:close'].y);
});
