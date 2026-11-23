import { expect, type Page } from '@playwright/test';
import { BARRICADE_AIM_REASONS, BARRICADE_UNLOCKED, BARRICADE_UNLOCK_HINT } from '../src/game/names';
import { BARRICADE_HP } from '../src/sim/blockers';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, openCampaign, press, visibleTexts } from './campaign';
import { waitForTitle } from './title';
import { liftPage, rectPageSize, touchHold, ui, worldPage, type Point } from './phone';

export async function startBarricadeWave(page: Page, wave: number, touch = false): Promise<void> {
  await openCampaign(page, touch);
  await page.evaluate((wave) => {
    const t = window.__tarpit as TarpitTestApi;
    t.state().wave = wave - 1;
    if (!t.startWave().ok) throw new Error('wave did not start');
  }, wave);
}

export async function aimBarricade(page: Page, touch = false): Promise<void> {
  await press(page, 'special', touch);
  await press(page, 'special:barricade', touch);
  expect((await ui(page)).special.aiming).toBe('barricade');
}

export async function castAt(page: Page, world: Point, touch = false): Promise<void> {
  const p = await worldPage(page, world);
  if (touch) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

export async function aimCases(page: Page, touch: boolean, phone = false): Promise<void> {
  await startBarricadeWave(page, 7, touch);
  await press(page, 'special', touch);
  for (const type of ['keg', 'barricade', 'tarBarrel', 'fireArrows']) {
    const size = await rectPageSize(page, 'special:' + type);
    expect(Math.min(size.width, size.height), type).toBeGreaterThanOrEqual(44);
  }
  await press(page, 'special:barricade', touch);
  const cases = [
    { x: 3, y: 240, reason: 'near-spawn' }, { x: 957, y: 192, reason: 'near-exit' },
    { x: 400, y: 3, reason: 'off-trail' }, { x: 400, y: 477, reason: 'off-trail' },
    { x: 3, y: 3, reason: 'off-trail' }, { x: 957, y: 477, reason: 'off-trail' },
  ] as const;
  for (const p of cases) {
    const before = (await ui(page)).special;
    expect(before.aiming).toBe('barricade');
    if (!touch) {
      const q = await worldPage(page, p);
      await page.mouse.move(q.x, q.y);
      expect((await ui(page)).special.barricadeAim).toMatchObject({ valid: false, reason: BARRICADE_AIM_REASONS[p.reason] });
    }
    await castAt(page, p, touch);
    const s = (await ui(page)).special;
    expect(s.labels.length).toBe(before.labels.length + 1);
    expect(s.labels.at(-1)?.text, JSON.stringify(p)).toBe(BARRICADE_AIM_REASONS[p.reason]);
    expect(s).toMatchObject({ charges: 1, rechargeTicks: 0, blocker: null });
  }
  // Aim outside the bend, equidistant from the two segment endpoints.
  const target = { x: 432, y: 82 };
  if (touch) {
    const q = await worldPage(page, target);
    q.y += await liftPage(page);
    const client = await page.context().newCDPSession(page);
    const cave = await worldPage(page, { x: 24, y: 240 });
    cave.y += await liftPage(page);
    await touchHold(page, client, cave, 400, async () => {
      expect((await ui(page)).special.barricadeAim).toMatchObject({ valid: false, reason: BARRICADE_AIM_REASONS['near-spawn'] });
    });
    expect((await ui(page)).special).toMatchObject({ charges: 1, rechargeTicks: 0, blocker: null });
    await touchHold(page, client, q, 400, async () => {
      const u = await ui(page);
      expect(u.special).toMatchObject({ holding: true, barricadeAim: { valid: true } });
      if (phone) expect(u.magnifier).not.toBeNull();
    });
    await client.detach();
  } else {
    const p = await worldPage(page, target);
    await page.mouse.move(p.x, p.y);
    expect((await ui(page)).special.barricadeAim).toMatchObject({ valid: true });
    await castAt(page, target);
  }
  expect(await api(page, t => t.state().blocker)).toMatchObject({ x: 420, y: 96, distance: 564, hp: BARRICADE_HP });
  expect((await ui(page)).special).toMatchObject({ charges: 0, rechargeTicks: 1200 });
}

export async function hintAndRestart(page: Page): Promise<void> {
  await startBarricadeWave(page, 2);
  expect((await ui(page)).special.unlocked).toEqual(['keg']);
  await api(page, t => {
    t.state().spawnedPerGroup.fill(9999);
    t.step(1);
    t.startWave();
    t.step(15);
  });
  expect((await ui(page)).momentBanner).toBe(BARRICADE_UNLOCKED);
  expect(await visibleTexts(page)).toContain(BARRICADE_UNLOCK_HINT);
  for (const key of ['playAgain', 'menu']) {
    await aimBarricade(page);
    await castAt(page, { x: 300, y: 96 });
    expect(await api(page, t => t.state().blocker)).toMatchObject({ hp: BARRICADE_HP });
    await api(page, t => {
      // Force a real exit with one life remaining to get the two end-screen buttons.
      const s = t.state();
      s.lives = 1;
      s.enemies = [{ id: s.nextEnemyId++, type: 'wolf', hp: 20, distance: 1583, slow: 0, slowTicksLeft: 0 }];
      t.step(1);
    });
    expect(await api(page, t => t.endScreen())).toBe('lost');
    await press(page, key);
    if (key === 'menu') {
      await waitForTitle(page);
      await press(page, 'title:play');
    }
    await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game' && window.__tarpit.state?.().wave === 0);
    expect((await ui(page)).special).toMatchObject({ blocker: null, barricadeAim: null, labels: [] });
    await api(page, t => { t.state().wave = 2; t.startWave(); t.step(15); });
    expect(await visibleTexts(page)).not.toContain(BARRICADE_UNLOCK_HINT);
  }
}

export async function aimFrame(page: Page): Promise<void> {
  await startBarricadeWave(page, 7);
  await api(page, t => {
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    s.gold = 160;
    if (!t.buildAt(15, 9, 'cannon').ok) throw new Error('Cannon fixture');
    // Keep the placement reticle visible before the first shell lands.
    s.towers[0].cooldownTicks = 30;
    // Shieldbearers carry through a Cannon impact. Staggered arrivals show the approach as well as the pile.
    s.enemies = Array.from({ length: 12 }, (_, i) => ({
      id: s.nextEnemyId++, type: 'shieldbearer', hp: 70, distance: 765 - 11 * i, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
  });
  await aimBarricade(page);
  const p = await worldPage(page, { x: 456, y: 312 });
  await page.mouse.move(p.x, p.y);
  expect((await ui(page)).special.barricadeAim).toMatchObject({ valid: true, point: { x: 420, y: 312 } });
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await expect(page.locator('canvas')).toHaveScreenshot('barricade-aim.png');
  if (process.env.M39_FRAMES) await page.locator('canvas').screenshot({ path: process.env.M39_FRAMES + '/m39-barricade-aim.png' });
}
