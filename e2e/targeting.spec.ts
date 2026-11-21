import { expect, test, type Page } from '@playwright/test';
import { targetingButtonText } from '../src/game/names';
import type { TarpitTestApi } from '../src/game/testGlobal';

// Milestone 24: the tower panel's targeting button cycles first -> last ->
// strongest, and the shots follow. Time is frozen (?test=1) and driven by
// step(). Numbers from the headless simulation (same build, same waves): a
// Musketeer at (7,5) (centre 240,176, range 110) in wave 1, with gold set
// high so nothing else changes. Goblins spawn every 60 ticks at 60 px/s.
// - Tick 212: the first tick with two goblins in range (id 0 at path
//   distance 211, id 1 at 151). The Musketeer fires every 60 ticks.
// - First: the shot at tick 272 hits id 0 (furthest along; it dies).
// - Last: the shot at tick 332 hits id 3 (just entered the range at the
//   spawn side) rather than id 1 (the furthest, which 'first' would take).
// - Strongest, every goblin's hp set to 30: the shot at tick 392 hits id 1,
//   the furthest, the same pick as 'first'. It now has 18 hp.
// - Strongest with id 1 set to 10 hp: the shot at tick 452 hits id 2, the
//   furthest of the full-hp goblins, not id 1 ('first' would take id 1).

const C75 = { col: 7, row: 5 };

async function startGame(page: Page): Promise<void> {
  await page.goto('/?test=1');
  await page.waitForFunction(() => window.__tarpit?.scene?.() === 'title');
  await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
}

const api = <T>(page: Page, f: (a: TarpitTestApi) => T) => page.evaluate(`(${f.toString()})(window.__tarpit)`) as Promise<T>;
const ui = (page: Page) => api(page, (a) => a.ui());
const rects = (page: Page) => api(page, (a) => a.uiRects());

async function click(page: Page, name: string): Promise<void> {
  const r = (await rects(page))[name];
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
}

const clickCell = (page: Page, c: { col: number; row: number }) => page.mouse.click(c.col * 32 + 16, c.row * 32 + 16);

/**
 * Step one tick at a time until the Musketeer's next hit; return the tick,
 * the enemy hit, and every live enemy (id, distance, hp) just before that tick.
 */
async function nextHit(page: Page) {
  return page.evaluate(() => {
    const t = window.__tarpit as TarpitTestApi;
    for (let n = 0; n < 120; n++) {
      const before = t.state().enemies.map((e) => ({ id: e.id, distance: e.distance, hp: e.hp }));
      t.step(1);
      const hit = t.events().find((e) => e.kind === 'hit');
      if (hit && hit.kind === 'hit') return { tick: t.state().tick, enemyId: hit.enemyId, before };
    }
    throw new Error('no hit within 120 ticks');
  });
}

const setHp = (page: Page, hp: Record<number, number> | number) =>
  page.evaluate((h) => {
    // Test setup through the live object, like setGold in build-ui.spec.ts.
    for (const e of (window.__tarpit as TarpitTestApi).state().enemies) {
      const v = typeof h === 'number' ? h : h[e.id];
      if (v !== undefined) e.hp = v;
    }
  }, hp);

test('cycling the panel button changes which goblin the Musketeer shoots', async ({ page }) => {
  await startGame(page);
  await api(page, (a) => {
    a.state().gold = 1000;
    a.buildAt(7, 5, 'musketeer');
    a.startWave();
    a.step(212);
  });
  const at212 = await api(page, (a) => ({ tick: a.state().tick, enemies: a.state().enemies.map((e) => ({ id: e.id, distance: e.distance })) }));
  expect(at212.tick).toBe(212);
  // Ids 0 and 1 are in range; 2 (91) and 3 (31) are not yet.
  expect(at212.enemies).toEqual([
    { id: 0, distance: 211 },
    { id: 1, distance: 151 },
    { id: 2, distance: 91 },
    { id: 3, distance: 31 },
  ]);

  // First (the default): the furthest goblin.
  const first = await nextHit(page);
  expect(first).toMatchObject({ tick: 272, enemyId: 0 });
  expect(first.before.find((e) => e.id === 0)!.distance).toBeGreaterThan(first.before.find((e) => e.id === 1)!.distance);

  // Select the tower and click the targeting button once: Last.
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, panelOpen: true, selectedTargeting: 'first', targetLabel: targetingButtonText('first') });
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'last', targetLabel: targetingButtonText('last') });
  expect(await api(page, (a) => a.events().at(-1))).toEqual({ kind: 'targeting', cell: C75, mode: 'last' });
  const last = await nextHit(page);
  expect(last).toMatchObject({ tick: 332, enemyId: 3 });
  // A different, lower-path-distance goblin than the furthest one ('first' would take id 1).
  const furthest = last.before.reduce((a, b) => (b.distance > a.distance ? b : a));
  expect(furthest.id).toBe(1);
  expect(last.enemyId).not.toBe(furthest.id);

  // Click again: Strongest. With every goblin at equal hp the pick equals 'first'.
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'strongest', targetLabel: targetingButtonText('strongest') });
  await setHp(page, 30);
  const equal = await nextHit(page);
  expect(equal).toMatchObject({ tick: 392, enemyId: 1 });

  // One goblin weaker (id 1, also the furthest): strongest takes another.
  await setHp(page, { 1: 10 });
  const strong = await nextHit(page);
  expect(strong).toMatchObject({ tick: 452, enemyId: 2 });
  expect(strong.before.find((e) => e.id === 1)).toMatchObject({ hp: 10 });

  // A third click wraps back to First.
  await click(page, 'panel:target');
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'first', targetLabel: targetingButtonText('first') });

  // Sell and rebuild: the new tower is 'first'.
  await click(page, 'panel:target'); // Last again, so the reset is visible
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'last' });
  await click(page, 'panel:sell');
  expect(await ui(page)).toMatchObject({ panelOpen: false, selectedTargeting: null });
  expect(await api(page, (a) => a.buildAt(7, 5, 'musketeer').ok)).toBe(true);
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedCell: C75, selectedTargeting: 'first', targetLabel: targetingButtonText('first') });
});

test('setTargetingAt sets the mode; refused on an empty cell', async ({ page }) => {
  await startGame(page);
  expect(await api(page, (a) => a.setTargetingAt(7, 5, 'last'))).toEqual({ ok: false, reason: 'no-tower' });
  await api(page, (a) => a.buildAt(7, 5, 'musketeer'));
  expect(await api(page, (a) => a.setTargetingAt(7, 5, 'strongest'))).toEqual({ ok: true });
  await clickCell(page, C75);
  expect(await ui(page)).toMatchObject({ selectedTargeting: 'strongest', targetLabel: targetingButtonText('strongest') });
});

test('the three-button panel stays on the map and off the HUD for a tower at (29,14)', async ({ page }) => {
  await startGame(page);
  // (29,14), the bottom-right cell, is buildable.
  expect(await api(page, (a) => a.buildAt(29, 14, 'musketeer').ok)).toBe(true);
  await clickCell(page, { col: 29, row: 14 });
  expect(await ui(page)).toMatchObject({ selectedCell: { col: 29, row: 14 }, panelOpen: true });
  const r = await rects(page);
  for (const name of ['panel:upgrade', 'panel:sell', 'panel:target', 'panel:close']) {
    const b = r[name];
    expect(b, name).toBeTruthy();
    expect(b.x, name).toBeGreaterThanOrEqual(0);
    expect(b.y, name).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, name).toBeLessThanOrEqual(960);
    expect(b.y + b.height, name).toBeLessThan(480);
  }
  // Stacked: Upgrade, Sell, Target, each 156 x 42.
  expect([r['panel:upgrade'], r['panel:sell'], r['panel:target']].map((b) => [b.width, b.height])).toEqual([
    [156, 42],
    [156, 42],
    [156, 42],
  ]);
  expect(r['panel:sell'].y).toBeGreaterThan(r['panel:upgrade'].y);
  expect(r['panel:target'].y).toBeGreaterThan(r['panel:sell'].y);
});
