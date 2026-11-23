import { expect, type Page } from '@playwright/test';
import { BARRICADE_AIM_REASONS } from '../src/game/names';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { GUARD_COUNT } from '../src/sim/blockers';
import { aimBarricade, castAt, startBarricadeWave } from './barricade';
import { api, press } from './campaign';
import { liftPage, rectPageSize, touchHold, ui, worldPage } from './phone';
import { settle } from './painted';

// A turn shows each soldier's footing on the two segments of the same trail.
const anchor = { x: 420, y: 114 };

async function chooseGuards(page: Page, touch: boolean): Promise<void> {
  await press(page, 'special', touch);
  await press(page, 'special:guards', touch);
  expect((await ui(page)).special.aiming).toBe('guards');
}

export async function expectStanding(page: Page, painted = false): Promise<void> {
  const state = await api(page, t => t.state().blockers.filter(b => b.kind === 'guard'));
  const draw = (await ui(page)).special.guards.filter(g => g.hpBar);
  expect(state).toHaveLength(GUARD_COUNT);
  expect(draw).toHaveLength(state.length);
  const layout = await api(page, t => t.layout()) === 'portrait' ? PORTRAIT : LANDSCAPE;
  for (const guard of state) {
    const figure = draw.find(g => g.id === guard.id)!;
    const target = layout.toScreen(guard);
    expect(Math.hypot(figure.point.x - target.x, figure.point.y - target.y)).toBeLessThanOrEqual(6);
    expect(figure.hp).toBe(guard.hp);
    expect(figure.maxHp).toBe(guard.maxHp);
    expect(figure.hpBar!.fillWidth).toBeGreaterThan(0);
    if (painted) expect(figure.texture).toContain(':guard:');
  }
}

export async function placement(page: Page, touch: boolean, phone = false): Promise<void> {
  await startBarricadeWave(page, 7, touch);
  await press(page, 'special', touch);
  const rects = await api(page, t => t.uiRects());
  const options = Object.entries(rects).filter(([key]) => key.startsWith('special:'));
  expect(options).toHaveLength(5);
  const bounds = (phone ? PORTRAIT : LANDSCAPE).map;
  for (const [i, [key, r]] of options.entries()) {
    const { width, height } = await rectPageSize(page, key);
    expect(Math.min(width, height), key).toBeGreaterThanOrEqual(44);
    expect(r.x).toBeGreaterThanOrEqual(bounds.x);
    expect(r.y).toBeGreaterThanOrEqual(bounds.y);
    expect(r.x + r.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(r.y + r.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    for (const [, b] of options.slice(i + 1)) {
      expect(r.x < b.x + b.width && b.x < r.x + r.width && r.y < b.y + b.height && b.y < r.y + r.height).toBe(false);
    }
  }
  await press(page, 'special:guards', touch);
  for (const [x, y, reason] of [[20, 240, 'near-spawn'], [635, 16, 'off-trail'], [949, 192, 'near-exit']] as const) {
    await castAt(page, { x, y }, touch);
    const special = (await ui(page)).special;
    expect(special.labels.at(-1)?.text).toBe(BARRICADE_AIM_REASONS[reason]);
    expect(special).toMatchObject({ charges: 1, guards: [], aiming: 'guards' });
  }
  const target = await worldPage(page, anchor);
  const check = async () => {
    const special = (await ui(page)).special;
    expect(special.guardsAim?.valid).toBe(true);
    expect(special.guardsAim?.marks).toHaveLength(GUARD_COUNT);
    if (phone) expect((await ui(page)).magnifier).not.toBeNull();
    return special.guardsAim!.marks;
  };
  let marks: { x: number; y: number }[] | undefined;
  if (touch) {
    const client = await page.context().newCDPSession(page);
    await touchHold(page, client, { x: target.x, y: target.y + await liftPage(page) }, 400, async () => { marks = await check(); });
    await client.detach();
  } else {
    await page.mouse.move(target.x, target.y);
    marks = await check();
    await page.mouse.click(target.x, target.y);
  }
  await expectStanding(page);
  expect((await ui(page)).special.guards.map(g => g.point)).toEqual(marks);
  const saved = await api(page, t => t.state().blockers);
  if (phone) {
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(() => api(page, t => t.layout())).toBe('landscape');
    await settle(page);
    expect(await api(page, t => t.state().blockers)).toEqual(saved);
    await expectStanding(page);
  }
  // The wall takes the next shared charge. Both types survive together.
  await api(page, t => { t.state().specialRechargeTicks = 1; t.step(1); });
  await aimBarricade(page, touch);
  await castAt(page, { x: 420, y: 260 }, touch);
  expect((await ui(page)).special.blocker).not.toBeNull();
  await expectStanding(page);
  if (touch) {
    await api(page, t => { t.state().specialRechargeTicks = 1; t.step(1); });
    await chooseGuards(page, true);
    await castAt(page, { x: 620, y: 384 }, true);
    const live = await api(page, t => t.state().blockers.filter(b => b.kind === 'guard'));
    expect(live).toHaveLength(GUARD_COUNT);
    expect(live.every(g => saved.every(b => b.kind !== 'guard' || b.id !== g.id))).toBe(true);
    expect((await ui(page)).special.blocker).not.toBeNull();
  }
}

export async function frame(page: Page, mode: 'aim' | 'holding' | 'phone' | 'painted'): Promise<void> {
  const phone = mode === 'phone';
  if (mode === 'painted') await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
  await startBarricadeWave(page, 7, phone);
  // Use a horizontal file on each screen so the holding frame shows the individual spears.
  const spot = phone ? { x: 420, y: 282 } : { x: 505, y: 384 };
  const leadDistance = phone ? 750 : 937;
  await page.evaluate(distance => {
    const t = window.__tarpit as import('../src/game/testGlobal').TarpitTestApi;
    const s = t.state();
    s.gold = 200;
    if (!t.buildAt(15, 9, 'cannon').ok) throw new Error('Guard frame tower');
    s.towers[0].cooldownTicks = 300;
    s.spawnedPerGroup.fill(9999);
    s.enemies = Array.from({ length: 9 }, (_, i) => ({
      id: s.nextEnemyId++, type: i % 3 === 0 ? 'shieldbearer' : 'goblin',
      hp: i % 3 === 0 ? 70 : 23, distance: distance - 80 - 19 * i, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
  }, leadDistance);
  await chooseGuards(page, phone);
  if (mode === 'aim') {
    const p = await worldPage(page, { x: spot.x, y: spot.y - 26 });
    await page.mouse.move(p.x, p.y);
    expect((await ui(page)).special.guardsAim?.marks).toHaveLength(GUARD_COUNT);
  } else {
    await castAt(page, spot, phone);
    await api(page, t => t.step(105));
    await expectStanding(page, mode === 'painted');
    const guards = (await ui(page)).special.guards;
    expect(guards.some(g => g.hpBar && g.hp < g.maxHp)).toBe(true);
    expect(await api(page, t => t.events().some(e => e.kind === 'guardStrike'))).toBe(true);
  }
  await settle(page);
  const canvas = page.locator('canvas');
  const name = { aim: 'guards-aim', holding: 'guards-holding', phone: 'phone-guards-holding', painted: 'painted-guards-holding' }[mode];
  await expect(canvas).toHaveScreenshot(name + '.png');
  if (process.env.M40_FRAMES) await canvas.screenshot({ path: process.env.M40_FRAMES + '/m40-guards-' + mode + '.png' });
}
