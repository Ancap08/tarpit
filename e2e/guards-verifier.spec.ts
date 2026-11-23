// Milestone 40 verifier. Independent of guards.spec.ts: the drawn position of
// each guard is measured from its rendered silhouette in canvas pixels,
// not from the position the drawing reports about itself.
import { expect, test } from '@playwright/test';
import { GUARDS_UNLOCK_HINT, GUARDS_UNLOCKED } from '../src/game/names';
import { api, press, visibleTexts } from './campaign';
import { startBarricadeWave } from './barricade';
import { rectPageSize, rects, ui } from './phone';
import { measure, popupFits, standSquad } from './guardsVerifier';
import { settle } from './painted';

test('Classic: every guard is drawn on its simulation position (pixel measured)', async ({ page }) => {
  await standSquad(page, { x: 420, y: 250 }, false); // lower leg of the Meadow trail, a corner at 420,384: the line bends
  await measure(page, false);
});

test('Classic: a squad around a corner is drawn on the trail', async ({ page }) => {
  await standSquad(page, { x: 420, y: 108 }, false); // the line bends at (420, 96) between guard 0 and guard 2
  await measure(page, false);
});

test('Painted: every guard is drawn on its simulation position (pixel measured)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
  await standSquad(page, { x: 500, y: 384 }, false);
  await measure(page, false);
});

test('popup, hint once, snap marks, leaks', async ({ page }) => {
  await startBarricadeWave(page, 6);
  await api(page, (t) => t.step(15));
  expect((await ui(page)).momentBanner).toBe(GUARDS_UNLOCKED);
  const hints = (await visibleTexts(page)).filter((s) => s === GUARDS_UNLOCK_HINT);
  expect(hints).toHaveLength(1);
  await press(page, 'special');
  const r = await rects(page);
  const keys = Object.keys(r).filter((k) => k.startsWith('special:'));
  expect(keys.sort()).toEqual(['special:barricade', 'special:guards', 'special:keg', 'special:tarBarrel']);
  expect(keys).toHaveLength(4); // wave 6: fire arrows unlock on wave 7
  for (const k of keys) {
    const size = await rectPageSize(page, k);
    expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
    const box = r[k];
    for (const [other, o] of Object.entries(r)) {
      if (other.startsWith('special:') || o.width === 0) continue;
      if (other === 'special') continue;
      const overlap = box.x < o.x + o.width && o.x < box.x + box.width && box.y < o.y + o.height && o.y < box.y + box.height;
      expect(overlap, `${k} over ${other}`).toBe(false);
    }
  }
  // the leak check: count display objects, cast five squads that each expire, count again
  await press(page, 'special'); // close
  const count = () => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { children: { length: number } }).children.length);
  const before = await count();
  for (let i = 0; i < 5; i++) {
    await page.evaluate((x) => {
      const t = window.__tarpit as import('../src/game/testGlobal').TarpitTestApi;
      t.state().specialCharges = 1; t.state().spawnedPerGroup.fill(9999); t.state().enemies = [];
      t.useSpecialAt('guards', x, 96); t.step(721); t.step(1);
    }, 200 + 10 * i);
    await settle(page);
    await page.waitForTimeout(500);
  }
  expect((await ui(page)).special.guards).toEqual([]);
  expect(await count()).toBeLessThanOrEqual(before);
});

test('a fight: bars match hp, a guard falls, enemies stand where it is drawn', async ({ page }) => {
  await startBarricadeWave(page, 7);
  await api(page, (t) => {
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    s.enemies = [{ id: 900, type: 'troll', hp: 950, distance: 120, slow: 0, slowTicksLeft: 0 }];
    t.useSpecialAt('guards', 200, 240);
  });
  await api(page, (t) => t.step(60));
  const live = (await ui(page)).special.guards;
  const hp = await api(page, (t) => t.state().blockers.filter((b) => b.kind === 'guard').map((b) => [b.id, b.hp]));
  for (const g of live.filter((x) => x.hpBar)) {
    const want = Math.max(1, Math.round((g.hpBar!.width - 2) * g.hp / g.maxHp));
    expect(g.hpBar!.fillWidth).toBe(want);
    expect(hp.some(([id, v]) => id === g.id && v === g.hp)).toBe(true);
  }
  expect(live.filter((g) => g.hpBar)).toHaveLength(4);
  const e = await api(page, (t) => t.state().enemies[0]);
  const stands = await api(page, (t) => t.state().blockers.map((b) => b.distance));
  expect(stands).toContain(e.distance);
});

test('five specials fit on the desktop screen', async ({ page }) => popupFits(page, false, false));
