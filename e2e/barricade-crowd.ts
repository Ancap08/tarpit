import { expect, type Page } from '@playwright/test';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { heldCountText } from '../src/game/names';
import { ENEMY_STATS } from '../src/sim/enemies';
import { startBarricadeWave, aimBarricade, castAt } from './barricade';
import { api, visibleTexts } from './campaign';

// One walker reaches the wall per tick. A Harpy flies past without joining the count.
async function stageCrowd(page: Page, phone: boolean, size: number): Promise<void> {
  await startBarricadeWave(page, 7, phone);
  await api(page, t => {
    if (!t.buildAt(15, 5, 'cannon').ok) throw new Error('Cannon fixture');
    t.state().towers[0].cooldownTicks = 120;
  });
  await aimBarricade(page, phone);
  await castAt(page, { x: 420, y: 164 }, phone);
  const types = ['shieldbearer', 'goblin', 'wolf', 'goblin', 'troll', 'shieldbearer', 'goblin'] as const;
  const walkers = Array.from({ length: size }, (_, i) => {
    const type = types[i % types.length];
    const { hp, speed } = ENEMY_STATS[type];
    return { type, hp: i % 3 === 0 ? Math.ceil(hp / 2) : hp, behind: (i + 0.5) * speed / 60 };
  });
  await page.evaluate(walkers => {
    const s = window.__tarpit!.state!();
    const wall = s.blocker!;
    s.spawnedPerGroup.fill(9999);
    s.enemies = walkers.map(({ type, hp, behind }) => ({
      id: s.nextEnemyId++, type, hp, distance: wall.distance - behind, slow: 0, slowTicksLeft: 0,
    }));
    s.enemies.push({ id: s.nextEnemyId++, type: 'harpy', hp: 36, distance: wall.distance - 1, slow: 0, slowTicksLeft: 0 });
  }, walkers);
}

async function expectHeldCrowd(page: Page, phone: boolean, n: number): Promise<void> {
  const { wall, positions } = await api(page, t => {
    const { blocker, enemies } = t.state();
    const held = enemies.filter(e => e.type !== 'harpy' && e.distance === blocker!.distance);
    return { wall: blocker!, positions: held.map(e => {
      const { x, y } = t.animState(e.id)!;
      return { x, y };
    }) };
  });
  const center = (phone ? PORTRAIT : LANDSCAPE).toScreen(wall);
  expect(positions).toHaveLength(n);
  for (const p of positions) {
    expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeLessThanOrEqual(36);
  }
  const pixels = positions.map(p => Math.round(p.x) + ',' + Math.round(p.y));
  expect(new Set(pixels).size).toBeGreaterThanOrEqual(Math.min(n, 6));
  const labels = (await visibleTexts(page)).filter(text => /^x\d+$/.test(text));
  expect(labels).toEqual(n > 3 ? [heldCountText(n)] : []);
}

export async function crowd(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 20);
  for (let n = 1; n <= 20; n++) {
    await api(page, t => t.step(1));
    await expectHeldCrowd(page, phone, n);
  }
  expect(await api(page, t => t.state().enemies.find(e => e.type === 'harpy')!.distance > t.state().blocker!.distance)).toBe(true);
  // At the cave clearance, include both bosses to check their lifted sprite centres.
  await api(page, t => {
    const s = t.state();
    s.specialCharges = 1;
    if (!t.useSpecialAt('barricade', 64, 240).ok) throw new Error('wall at the cave clearance');
    s.enemies = Array.from({ length: 40 }, (_, i) => ({
      id: s.nextEnemyId++, type: i === 0 ? 'grumblemaw' : i === 1 ? 'boss' : 'goblin',
      hp: 23, distance: s.blocker!.distance, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
  });
  await expectHeldCrowd(page, phone, 40);
}

export async function holdingFrame(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 15);
  await api(page, t => t.step(35));
  await expectHeldCrowd(page, phone, 15);
  const blocker = await api(page, t => t.state().blocker);
  expect(blocker!.hp).toBeLessThan(blocker!.maxHp);
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveScreenshot(phone ? 'phone-barricade-holding.png' : 'barricade-holding.png');
  if (process.env.M39_FRAMES) {
    await canvas.screenshot({ path: process.env.M39_FRAMES + '/m39-barricade-' + (phone ? 'phone' : 'holding') + '.png' });
  }
}
