import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { MAPS, positionAlongPath } from '../src/sim/map';
import { SPECIAL_DEFS } from '../src/sim/specials';
import type { Enemy, GameEvent } from '../src/sim';

// Milestone 25b, desktop project (real mouse): special attacks from the
// HUD's Special button. At the 960x580 viewport canvas space is page space.
// Time is frozen (?test=1): the test steps it.

type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const pos = (e: Enemy): Point => positionAlongPath(MAPS.meadow, e.distance);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Start a game and, with `wave` > 1, jump so the next Start Wave plays that wave (test setup). */
async function startGame(page: Page, wave = 1): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(async (w) => {
    const t = window.__tarpit as TarpitTestApi;
    await t.startGame();
    t.state().wave = w - 1;
    t.state().gold = 1000;
  }, wave);
}

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

/** A point on whole pixels, as page.mouse reports it. */
const round = (p: Point): Point => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** The map point (an enemy's position, rounded) with the most live enemies within `radius`, and those enemies' ids. */
function bestAim(enemies: Enemy[], radius: number): { at: Point; ids: number[] } {
  let best = { at: { x: 0, y: 0 }, ids: [] as number[] };
  for (const e of enemies) {
    const at = round(pos(e));
    const ids = enemies.filter((o) => dist(pos(o), at) <= radius).map((o) => o.id);
    if (ids.length > best.ids.length) best = { at, ids };
  }
  return best;
}

test('Powder Keg by mouse on wave 1: greyed in setup, aimed at a Goblin, kills pay their bounty, one charge', async ({ page }) => {
  await startGame(page);
  // Setup before wave 1 (state.wave 0): no charge and nothing unlocked yet;
  // the button is greyed and a click does nothing.
  expect((await ui(page)).special).toEqual({ charges: 0, aiming: null, unlocked: [], menuOpen: false, aimPoint: null });
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false });

  await api(page, (a) => {
    a.startWave();
    a.step(600);
  });
  expect((await ui(page)).special.charges).toBe(1);
  // One special unlocked: the button selects the Powder Keg directly, no popup.
  await click(page, 'special');
  let u = await ui(page);
  expect(u.special).toMatchObject({ aiming: 'keg', menuOpen: false });
  expect(Object.keys(await rects(page)).filter((k) => k.startsWith('special:'))).toEqual([]);

  const before = await state(page);
  const { at, ids } = bestAim(before.enemies, SPECIAL_DEFS.keg.radius);
  expect(ids.length).toBeGreaterThanOrEqual(1);
  await page.mouse.move(at.x, at.y);
  u = await ui(page);
  expect(u.special.aiming).toBe('keg');
  expect(u.special.aimPoint).toEqual(at);
  await page.mouse.click(at.x, at.y);

  const ev: GameEvent[] = await events(page);
  const special = ev.find((e) => e.kind === 'special');
  expect(special).toMatchObject({ kind: 'special', type: 'keg', x: at.x, y: at.y, radius: 70 });
  expect(special && special.kind === 'special' ? special.hits : 0).toBeGreaterThanOrEqual(1);
  const kills = ev.filter((e) => e.kind === 'kill');
  expect(kills.length).toBeGreaterThanOrEqual(1);
  expect(kills.every((k) => k.kind === 'kill' && k.cause === 'special')).toBe(true);
  // Goblins have 30 hp: every enemy in the radius died.
  expect(kills.map((k) => (k.kind === 'kill' ? k.enemyId : -1)).sort()).toEqual([...ids].sort());
  const bounty = kills.reduce((sum, k) => sum + (k.kind === 'kill' ? k.bounty : 0), 0);
  const after = await state(page);
  expect(after.gold).toBe(before.gold + bounty);
  expect(after.enemies.length).toBe(before.enemies.length - kills.length);
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null });

  // The charge is spent: the button is greyed and does nothing.
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null, menuOpen: false });
});

test('Tar Barrel on wave 4: the popup lists Powder Keg and Tar Barrel; enemies in the radius are slowed 0.5', async ({ page }) => {
  await startGame(page, 4);
  await api(page, (a) => {
    a.startWave();
    a.step(420);
  });
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ menuOpen: true, aiming: null, unlocked: ['keg', 'tarBarrel'] });
  const names = Object.keys(await rects(page)).filter((k) => k.startsWith('special:'));
  expect(names).toEqual(['special:keg', 'special:tarBarrel']);
  await click(page, 'special:tarBarrel');
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: 'tarBarrel' });
  expect(Object.keys(await rects(page)).filter((k) => k.startsWith('special:'))).toEqual([]);

  const { at, ids } = bestAim((await state(page)).enemies, SPECIAL_DEFS.tarBarrel.radius);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  const s = await state(page);
  // Milestone 25c: the barrel slows on the special slow channel.
  for (const e of s.enemies) {
    const inside = dist(pos(e), at) <= SPECIAL_DEFS.tarBarrel.radius;
    expect(inside ? [e.specialSlow, e.specialSlowTicksLeft] : [e.id, 'outside'], `enemy ${e.id}`).toEqual(inside ? [0.5, 240] : [e.id, 'outside']);
  }
  expect(s.enemies.filter((e) => e.specialSlowTicksLeft === 240).map((e) => e.id).sort()).toEqual([...ids].sort());
  expect(s.specialCharges).toBe(0);
});

test('Fire Arrows on wave 7 set a Harpy burning', async ({ page }) => {
  await startGame(page, 7);
  await api(page, (a) => {
    a.startWave();
    a.step(540);
  });
  const harpy = (await state(page)).enemies.find((e) => e.type === 'harpy');
  expect(harpy).toBeTruthy();
  await click(page, 'special');
  expect(Object.keys(await rects(page)).filter((k) => k.startsWith('special:'))).toEqual(['special:keg', 'special:tarBarrel', 'special:fireArrows']);
  await click(page, 'special:fireArrows');
  const at = round(pos(harpy!));
  await page.mouse.move(at.x, at.y);
  expect((await ui(page)).special).toMatchObject({ aiming: 'fireArrows', aimPoint: at });
  await page.mouse.click(at.x, at.y);
  const h = (await state(page)).enemies.find((e) => e.id === harpy!.id)!;
  expect(h.burnTicksLeft).toBeGreaterThan(0);
  expect([h.burnDps, h.burnTicksLeft]).toEqual([SPECIAL_DEFS.fireArrows.burnDps, 240]); // 30/s since milestone 25c
});

test('Escape, the Special button, a HUD press and a tower pick cancel aiming and keep the charge', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => {
    a.startWave();
    a.step(120);
  });
  await click(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  await page.keyboard.press('Escape');
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });

  await click(page, 'special');
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });

  await click(page, 'special');
  await page.mouse.click(300, 505); // the HUD's stats, no button
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });

  // A tower pick cancels aiming...
  await click(page, 'special');
  await click(page, 'bar:longbow');
  let u = await ui(page);
  expect(u.pick).toBe('longbow');
  expect(u.special).toMatchObject({ aiming: null, charges: 1 });
  // ...and selecting a special clears the pick.
  await click(page, 'special');
  u = await ui(page);
  expect(u.pick).toBeNull();
  expect(u.special.aiming).toBe('keg');
  // Aiming, a click on a buildable cell fires the keg instead of building.
  await page.mouse.click(240, 176);
  const s = await state(page);
  expect([s.towers.length, s.specialCharges]).toEqual([0, 0]);
});
