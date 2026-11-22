import { expect, test, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { MAPS, positionAlongPath } from '../src/sim/map';
import { SPECIAL_DEFS, SPECIAL_RECHARGE_TICKS, ZONE_LINGER_TICKS } from '../src/sim/specials';
import type { Enemy, GameEvent } from '../src/sim';

// Milestone 25b, reworked in milestone 30, desktop project (real mouse):
// special attacks from the HUD's Special button. At the 960x580 viewport
// canvas space is page space. Time is frozen (?test=1): the test steps it.

type Point = { x: number; y: number };

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const state = (page: Page) => api(page, (a) => a.state());
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());
const events = (page: Page) => api(page, (a) => a.events());
const hud = (page: Page) => api(page, (a) => a.hudText());
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

test('Powder Keg by mouse: banner, circle under the pointer, a click fires, "N hit" label, recharge, a second keg in the same wave', async ({ page }) => {
  await startGame(page);
  // Setup before wave 1: nothing unlocked, greyed, a click does nothing.
  expect((await ui(page)).special).toMatchObject({ charges: 0, aiming: null, unlocked: [], ready: false, rechargeTicks: 0, banner: null });
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, menuOpen: false });

  await api(page, (a) => {
    a.startWave();
    a.step(900);
  });
  expect((await ui(page)).special).toMatchObject({ charges: 1, ready: true });
  await click(page, 'special');
  let u = await ui(page);
  expect(u.special).toMatchObject({ aiming: 'keg', menuOpen: false, banner: { main: 'Click the trail to throw the Powder Keg', hint: 'Esc or Special again cancels.' } });

  const before = await state(page);
  const { at, ids } = bestAim(before.enemies, SPECIAL_DEFS.keg.radius);
  expect(ids.length).toBeGreaterThanOrEqual(1);
  await page.mouse.move(at.x, at.y);
  expect((await ui(page)).special.aimPoint).toEqual(at);
  await page.mouse.click(at.x, at.y);

  const ev: GameEvent[] = await events(page);
  const special = ev.find((e) => e.kind === 'special');
  expect(special).toMatchObject({ kind: 'special', type: 'keg', x: at.x, y: at.y, radius: 90, hits: ids.length });
  u = await ui(page);
  expect(u.special).toMatchObject({ aiming: null, banner: null, ready: false, rechargeTicks: SPECIAL_RECHARGE_TICKS });
  expect(u.special.labels).toEqual([expect.objectContaining({ text: `${ids.length} hit`, x: at.x })]);
  expect((await hud(page)).special).toBe('Wait 20s');

  // The label goes after 1.5 s (90 ticks in test mode); the scorch mark after 2 s.
  await api(page, (a) => a.step(89));
  expect((await ui(page)).special.labels).toHaveLength(1);
  await api(page, (a) => a.step(1));
  expect((await ui(page)).special.labels).toEqual([]);

  // Greyed while recharging: a click does nothing.
  await click(page, 'special');
  expect((await ui(page)).special.aiming).toBeNull();
  await api(page, (a) => a.step(1200 - 90 - 1));
  expect((await ui(page)).special).toMatchObject({ ready: false, rechargeTicks: 1 });
  expect((await hud(page)).special).toBe('Wait 1s');
  await api(page, (a) => a.step(1));
  expect((await ui(page)).special).toMatchObject({ ready: true, rechargeTicks: 0 });
  expect((await hud(page)).special).toBe('Special');
  expect((await state(page)).phase).toBe('wave');
  // A second keg in the same wave.
  await click(page, 'special');
  await page.mouse.click(200, 200);
  expect((await events(page)).filter((e) => e.kind === 'special')).toHaveLength(1);
  expect((await ui(page)).special).toMatchObject({ ready: false, rechargeTicks: SPECIAL_RECHARGE_TICKS });
});

test('a keg on empty ground shows "Missed"', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => {
    a.startWave();
    a.step(10);
  });
  await click(page, 'special');
  await page.mouse.click(900, 60);
  expect((await events(page)).find((e) => e.kind === 'special')).toMatchObject({ hits: 0 });
  expect((await ui(page)).special.labels).toEqual([expect.objectContaining({ text: 'Missed' })]);
});

test('Tar Barrel on wave 4: the popup, a zone that slows while it lasts and is gone after 480 ticks', async ({ page }) => {
  await startGame(page, 4);
  await api(page, (a) => {
    a.startWave();
    a.step(420);
  });
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ menuOpen: true, aiming: null, unlocked: ['keg', 'tarBarrel'] });
  expect(Object.keys(await rects(page)).filter((k) => k.startsWith('special:'))).toEqual(['special:keg', 'special:tarBarrel']);
  await click(page, 'special:tarBarrel');
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, aiming: 'tarBarrel', banner: { main: 'Click the trail to drop the Tar Barrel' } });

  const { at, ids } = bestAim((await state(page)).enemies, SPECIAL_DEFS.tarBarrel.radius);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  await page.mouse.move(at.x, at.y);
  await page.mouse.click(at.x, at.y);
  let s = await state(page);
  for (const e of s.enemies) {
    const inside = dist(pos(e), at) <= SPECIAL_DEFS.tarBarrel.radius;
    if (inside) expect([e.specialSlow, e.specialSlowTicksLeft], `enemy ${e.id}`).toEqual([0.5, ZONE_LINGER_TICKS]);
  }
  expect((await ui(page)).special.zones).toEqual([{ id: 0, type: 'tarBarrel', x: at.x, y: at.y, ticksLeft: 480 }]);
  await api(page, (a) => a.step(479));
  s = await state(page);
  expect(s.zones.map((z) => z.ticksLeft)).toEqual([1]);
  await api(page, (a) => a.step(1));
  expect((await ui(page)).special.zones).toEqual([]);
});

test('Fire Arrows on wave 7: a Harpy in the circle burns at 20/s and the burning patch stays', async ({ page }) => {
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
  expect([h.burnDps, h.burnTicksLeft]).toEqual([SPECIAL_DEFS.fireArrows.burnDps, ZONE_LINGER_TICKS]);
  expect((await ui(page)).special.zones).toEqual([expect.objectContaining({ type: 'fireArrows', x: at.x, y: at.y })]);
});

test('Escape, the Special button and a HUD press cancel aiming and spend nothing; a tower pick does too', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => {
    a.startWave();
    a.step(120);
  });
  await click(page, 'special');
  expect((await ui(page)).special.aiming).toBe('keg');
  await page.keyboard.press('Escape');
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1, banner: null });

  await click(page, 'special');
  await click(page, 'special');
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });

  await click(page, 'special');
  await page.mouse.click(300, 505); // the HUD's stats, no button
  expect((await ui(page)).special).toMatchObject({ aiming: null, charges: 1 });

  await click(page, 'special');
  await click(page, 'bar:longbow');
  const u = await ui(page);
  expect(u.pick).toBe('longbow');
  expect(u.special).toMatchObject({ aiming: null, charges: 1, ready: true });
  expect((await events(page)).filter((e) => e.kind === 'special')).toEqual([]);
});

test('speed: a click toggles 1x and 2x; a press held 300 ms runs 3x while held and goes back on release', async ({ page }) => {
  await startGame(page);
  const r = (await rects(page)).speed;
  const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  await page.mouse.click(c.x, c.y);
  expect(await api(page, (a) => a.speed())).toBe(2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  expect(await api(page, (a) => a.speed())).toBe(3);
  expect((await hud(page)).speed).toBe('3x');
  await page.mouse.up();
  expect(await api(page, (a) => a.speed())).toBe(2);
  expect((await hud(page)).speed).toBe('2x');
  // The hold did not toggle; a click still does.
  await page.mouse.click(c.x, c.y);
  expect(await api(page, (a) => a.speed())).toBe(1);
  await api(page, (a) => a.setSpeed(3));
  expect((await hud(page)).speed).toBe('3x');
});

/** Click the Gold readout `n` times, `gapMs` apart. */
async function tapGold(page: Page, n: number, gapMs: number): Promise<void> {
  const r = (await rects(page)).gold;
  for (let i = 0; i < n; i++) {
    if (i > 0 && gapMs > 0) await page.waitForTimeout(gapMs);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
  }
}

test('gold cheat: five quick clicks on Gold add 500 and mark the game; four do not; slow clicks do not', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => {
    a.state().gold = 100;
  });
  await tapGold(page, 4, 0);
  expect((await state(page)).gold).toBe(100);
  await page.waitForTimeout(2100);
  await tapGold(page, 5, 600); // 2.4 s from the first to the fifth
  expect((await state(page)).gold).toBe(100);
  await page.waitForTimeout(2100);
  await tapGold(page, 5, 0);
  const s = await state(page);
  expect([s.gold, s.cheated]).toEqual([600, true]);
  expect((await hud(page)).cheat).toBe('cheat used');
  expect((await events(page)).at(-1)).toEqual({ kind: 'cheat', gold: 500 });
});

test('a cheated game saves no best score; Play again starts a clean game that does', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => a.cheatGold());
  await api(page, (a) => {
    a.buildAt(7, 5, 'musketeer');
    a.startWave();
    while (a.state().phase === 'wave') a.step(600);
  });
  let s = await state(page);
  expect([s.phase, s.wave, s.cheated]).toEqual(['setup', 1, true]);
  expect(await api(page, (a) => a.bestScore('normal'))).toBeNull();
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { playAgain(): void }).playAgain());
  await page.waitForFunction(() => {
    try {
      const s = (window.__tarpit as TarpitTestApi).state();
      return s.tick === 0 && s.cheated === false;
    } catch {
      return false;
    }
  });
  expect((await hud(page)).cheat).toBe('');
  await api(page, (a) => {
    a.buildAt(7, 5, 'musketeer');
    a.startWave();
    while (a.state().phase === 'wave') a.step(600);
  });
  s = await state(page);
  expect([s.phase, s.wave]).toEqual(['setup', 1]);
  expect(await api(page, (a) => a.bestScore('normal'))).toBe(1);
});

test('a hit on an enemy spawned earlier in the same frame flashes it (milestone 30 fix)', async ({ page }) => {
  await startGame(page);
  // A Musketeer by the spawn: Goblin 0 spawns on the first tick and is shot on the second.
  const r = await api(page, (a) => {
    a.buildAt(0, 5, 'musketeer');
    a.startWave();
    a.step(2); // both ticks in one frame: no redraw between them
    return { hit: a.events().some((e) => e.kind === 'hit' && e.enemyId === 0), anim: a.animState(0) };
  });
  expect(r.hit).toBe(true);
  expect(r.anim?.flags.hit).toBe(true);
});
