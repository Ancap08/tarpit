import { expect, test, type Page } from '@playwright/test';
import { callEarlyLabel, killsLabel } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { lastSpawnTick } from '../src/sim/game';
import { bestUnlockedSpecial, CLUSTER_POLICY_TICKS, densestCluster } from '../src/sim/headless';
import type { GameState } from '../src/sim/types';

// Verifier probes for milestone 25c in the browser (desktop project, real
// mouse, frozen time with ?test=1): the call-early label for every bonus
// from 20 to 0 stays inside the 130 px Start Wave button and goes back to
// "Start Wave" after the clear; a click while the wave is still spawning
// changes nothing on screen and logs no error; the "Kills N" line follows
// the tower while the panel is open and fits a 3-digit count; a tower that
// has kills cannot be moved (so "kept on move" never shows a number other
// than 0 in play); and one frame of wave 8 at its densest moment.

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const hud = (page: Page) => api(page, (a) => a.hudText());
const step = (page: Page, n: number) => page.evaluate((k) => (window.__tarpit as TarpitTestApi).step(k), n);

type Box = { x: number; y: number; width: number; height: number };

/** Console errors and uncaught page errors seen so far. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function startGame(page: Page, lives = 100000): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async (n) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().lives = n;
  }, lives);
}

async function click(page: Page, name: string): Promise<void> {
  const r = (await api(page, (a) => a.uiRects()))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

/** The Start Wave button's drawn label box, its font size and the button box (scene internals; they survive the build unminified). */
function startLabel(page: Page): Promise<{ label: Box; fontSize: string; button: Box; text: string }> {
  return page.evaluate(() => {
    type Txt = { text: string; style: { fontSize: string }; getBounds(): Box };
    type Box = { x: number; y: number; width: number; height: number };
    const scene = window.__tarpit!.game.scene.getScene('game') as unknown as { hud: { startButton: { label: Txt; rect: Box } } };
    const b = scene.hud.startButton;
    const g = b.label.getBounds();
    return { label: { x: g.x, y: g.y, width: g.width, height: g.height }, fontSize: b.label.style.fontSize, button: b.rect, text: b.label.text };
  });
}

test('the call-early label fits the 130 px button for every bonus from 20 down to 0, then reads Start Wave again after the clear', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  // Wave 5 with no towers: its two Trolls keep the wave alive past the 20 s grace.
  await api(page, (a) => {
    a.state().wave = 4;
    a.startWave();
  });
  const last = lastSpawnTick(5);
  await step(page, last + 1);
  let widest = 0;
  for (let k = 0; k <= 20; k++) {
    if (k > 0) await step(page, 60);
    const bonus = 20 - k;
    expect((await ui(page)).callEarly, `+${k} s`).toEqual({ available: true, bonus });
    const s = await startLabel(page);
    expect(s.text).toBe(callEarlyLabel(bonus));
    expect((await hud(page)).startWave).toBe(callEarlyLabel(bonus));
    expect(s.button.width).toBe(130);
    expect(s.fontSize).toBe('14px');
    // Inside the button with at least 2 px to spare on each side.
    expect(s.label.x, `left edge, bonus ${bonus}`).toBeGreaterThanOrEqual(s.button.x + 2);
    expect(s.label.x + s.label.width, `right edge, bonus ${bonus}`).toBeLessThanOrEqual(s.button.x + s.button.width - 2);
    expect(s.label.y).toBeGreaterThanOrEqual(s.button.y);
    expect(s.label.y + s.label.height).toBeLessThanOrEqual(s.button.y + s.button.height);
    widest = Math.max(widest, s.label.width);
  }
  console.log(`call-early label: widest ${widest.toFixed(1)} px in the 130 px button`);
  // Still "Call next  +0" long after the grace; then the wave clears.
  await step(page, 300);
  expect((await hud(page)).startWave).toBe(callEarlyLabel(0));
  for (let i = 0; i < 80 && (await state(page)).phase === 'wave'; i++) await step(page, 60);
  expect(await state(page)).toMatchObject({ phase: 'setup', wave: 5 });
  const after = await startLabel(page);
  expect(after.text).toBe('Start Wave');
  expect(after.fontSize).toBe('18px');
  expect(after.label.x).toBeGreaterThanOrEqual(after.button.x);
  expect(after.label.x + after.label.width).toBeLessThanOrEqual(after.button.x + after.button.width);
  expect((await ui(page)).callEarly).toEqual({ available: false, bonus: 0 });
  // And it starts wave 6 as before.
  await click(page, 'startWave');
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 6 });
  expect(errors).toEqual([]);
});

test('a click on Start Wave while the wave is still spawning changes nothing: same state, same pixels, no console error', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  await click(page, 'startWave');
  await step(page, 120);
  const r = (await api(page, (a) => a.uiRects())).startWave;
  // Park the mouse on the button first so hover is the same in both frames.
  await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2);
  const before = await state(page);
  const uiBefore = await ui(page);
  const shotBefore = await page.screenshot();
  for (let i = 0; i < 3; i++) await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  expect(await state(page)).toEqual(before);
  expect(await ui(page)).toEqual(uiBefore);
  expect((await hud(page)).startWave).toBe('Start Wave');
  const shotAfter = await page.screenshot();
  expect(shotAfter.equals(shotBefore), 'the frame after three clicks equals the frame before').toBe(true);
  expect((await api(page, (a) => a.callNextWave()))).toEqual({ ok: false, reason: 'still-spawning' });
  expect(await state(page)).toEqual(before);
  expect(errors).toEqual([]);
});

test('"Kills N" follows the tower tick by tick while the panel is open, and a 3-digit count fits inside the panel', async ({ page }) => {
  const errors = watchErrors(page);
  await startGame(page);
  const cell = { col: 7, row: 5 };
  expect(await page.evaluate((c) => (window.__tarpit as TarpitTestApi).buildAt(c.col, c.row, 'musketeer').ok, cell)).toBe(true);
  await page.mouse.click(cell.col * 32 + 16, cell.row * 32 + 16);
  expect(await ui(page)).toMatchObject({ panelOpen: true, killsLabel: killsLabel(0) });
  await api(page, (a) => a.startWave());
  // Step until the first kill, one tick at a time near it: the line changes on the tick the count does.
  let seen = 0;
  for (let i = 0; i < 1200 && seen < 3; i++) {
    await step(page, 1);
    const kills = (await state(page)).towers[0].kills;
    expect((await ui(page)).killsLabel, `tick ${i}`).toBe(killsLabel(kills));
    seen = kills;
  }
  expect(seen).toBe(3);
  const boxes = () =>
    page.evaluate(() => {
      type Box = { x: number; y: number; width: number; height: number };
      type Txt = { text: string; getBounds(): Box };
      const scene = window.__tarpit!.game.scene.getScene('game') as unknown as {
        panel: { killsText: Txt; stack: { backing: { getBounds(): Box } } };
      };
      const k = scene.panel.killsText.getBounds();
      const p = scene.panel.stack.backing.getBounds();
      return { kills: { x: k.x, y: k.y, width: k.width, height: k.height }, panel: { x: p.x, y: p.y, width: p.width, height: p.height } };
    });
  for (const n of [9, 99, 999, 9999]) {
    await page.evaluate((k) => {
      const t = window.__tarpit as TarpitTestApi;
      t.state().towers[0].kills = k;
      t.step(0);
    }, n);
    expect((await ui(page)).killsLabel).toBe(killsLabel(n));
    const b = await boxes();
    const rects = await api(page, (a) => a.uiRects());
    expect(b.panel.width).toBe(214);
    expect(b.panel.height).toBe(166);
    expect(b.kills.x, `Kills ${n} left`).toBeGreaterThanOrEqual(b.panel.x);
    expect(b.kills.y, `Kills ${n} top`).toBeGreaterThanOrEqual(b.panel.y);
    // Clear of the close button to its right and the Upgrade button below.
    expect(b.kills.x + b.kills.width, `Kills ${n} right`).toBeLessThanOrEqual(rects['panel:close'].x);
    expect(b.kills.y + b.kills.height, `Kills ${n} bottom`).toBeLessThanOrEqual(rects['panel:upgrade'].y);
  }
  expect(errors).toEqual([]);
});

test('kills and moves: a tower that has kills is locked and cannot be moved; an unlocked tower always shows Kills 0, before and after a move', async ({ page }) => {
  await startGame(page);
  expect(await api(page, (a) => a.buildAt(7, 5, 'musketeer').ok)).toBe(true);
  await api(page, (a) => a.startWave());
  for (let i = 0; i < 80 && (await state(page)).phase === 'wave'; i++) await step(page, 60);
  const cleared = await state(page);
  expect(cleared.phase).toBe('setup');
  const kills = cleared.towers[0].kills;
  expect(kills).toBeGreaterThan(0);
  // Planning phase of wave 2: the tower with kills is locked.
  expect(await api(page, (a) => a.moveAt(7, 5, 9, 5))).toEqual({ ok: false, reason: 'locked' });
  expect((await state(page)).towers[0]).toMatchObject({ cell: { col: 7, row: 5 }, kills });
  // A tower built this phase can move; it has no kills to keep.
  expect(await api(page, (a) => a.buildAt(9, 5, 'longbow').ok)).toBe(true);
  expect(await api(page, (a) => a.moveAt(9, 5, 9, 4).ok)).toBe(true);
  const moved = (await state(page)).towers.find((t) => t.cell.col === 9 && t.cell.row === 4);
  expect(moved).toMatchObject({ type: 'longbow', kills: 0, locked: false });
  await page.mouse.click(9 * 32 + 16, 4 * 32 + 16);
  expect(await ui(page)).toMatchObject({ panelOpen: true, killsLabel: killsLabel(0) });
  // Upgrading and (were it reachable) moving keep a count: an upgrade does.
  await page.mouse.click(7 * 32 + 16, 5 * 32 + 16);
  expect((await ui(page)).killsLabel).toBe(killsLabel(kills));
  expect(await api(page, (a) => a.upgradeAt(7, 5).ok)).toBe(true);
  expect((await ui(page)).killsLabel).toBe(killsLabel(kills));
});

// Milestone 25c second pass: the densest moment of wave 8 is now wave tick 1576, 22 enemies.
test('frame: comboBuild, wave 8 at its densest moment (wave tick 1576, 22 enemies on the map)', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const errors = watchErrors(page);
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async () => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.runScript('comboBuild', 8);
    t.startWave();
  });
  expect(await state(page)).toMatchObject({ phase: 'wave', wave: 8, lives: 13 });
  // The combo's cluster special for wave 8, as runScript would fire it.
  await step(page, CLUSTER_POLICY_TICKS[7]);
  const live = (await state(page)) as GameState;
  const aim = densestCluster(live)!;
  const special = bestUnlockedSpecial(8)!;
  expect(await page.evaluate(({ s, x, y }) => (window.__tarpit as TarpitTestApi).useSpecialAt(s, x, y).ok, { s: special, x: aim.centroid.x, y: aim.centroid.y })).toBe(true);
  await step(page, 1576 - CLUSTER_POLICY_TICKS[7]);
  const s = await state(page);
  expect(s.waveTick).toBe(1576);
  expect(s.enemies.length).toBe(22);
  await page.screenshot({ path: testInfo.outputPath('wave8-densest.png') });
  expect(errors).toEqual([]);
});
