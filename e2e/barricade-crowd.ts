import { expect, type Page } from '@playwright/test';
import { LANDSCAPE, PORTRAIT } from '../src/game/layout';
import { heldCountText } from '../src/game/names';
import { ENEMY_STATS } from '../src/sim/enemies';
import { MAPS, projectOntoTrail } from '../src/sim/map';
import { startBarricadeWave, aimBarricade, castAt } from './barricade';
import { api, visibleTexts } from './campaign';

// One walker reaches the wall per tick. The queue extends back around the bend
// at (420,96); a Harpy flies overhead without contributing to the count.
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

export async function crowd(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 20);
  const layout = phone ? PORTRAIT : LANDSCAPE;
  for (let n = 1; n <= 20; n++) {
    const positions = await api(page, t => {
      t.step(1);
      const { blocker, enemies } = t.state();
      return enemies.filter(e => e.type !== 'harpy' && e.distance === blocker!.distance).map(e => {
        const sprite = t.animState(e.id)!;
        return { x: Math.round(sprite.x), y: Math.round(sprite.y) };
      });
    });
    expect(positions).toHaveLength(n);
    expect(new Set(positions.map(p => p.x + ',' + p.y)).size).toBe(n);
    const labels = (await visibleTexts(page)).filter(text => /^x\d+$/.test(text));
    expect(labels).toEqual(n > 3 ? [heldCountText(n)] : []);
    if (n === 20) {
      const world = positions.map(p => layout.toWorld(p));
      for (const p of world) {
        const trail = projectOntoTrail(MAPS.meadow, p);
        expect(Math.hypot(p.x - trail.x, p.y - trail.y)).toBeLessThanOrEqual(20);
      }
      expect(world.some(p => p.y > 116 && Math.abs(p.x - 420) <= 20)).toBe(true);
      expect(world.some(p => p.x < 400 && Math.abs(p.y - 96) <= 20)).toBe(true);
    }
  }
  expect(await api(page, t => t.state().enemies.find(e => e.type === 'harpy')!.distance > t.state().blocker!.distance)).toBe(true);
  // Even at the cave clearance a full horde must never wrap back to slot zero.
  const packed = await api(page, t => {
    const s = t.state();
    s.specialCharges = 1;
    if (!t.useSpecialAt('barricade', 64, 240).ok) throw new Error('wall at the cave clearance');
    s.enemies = Array.from({ length: 40 }, () => ({
      id: s.nextEnemyId++, type: 'goblin', hp: 23, distance: 63, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
    return s.enemies.filter(e => e.distance === s.blocker!.distance).map(e => {
      const { x, y } = t.animState(e.id)!;
      return Math.round(x) + ',' + Math.round(y);
    });
  });
  expect(new Set(packed).size).toBe(40);
  expect(await visibleTexts(page)).toContain(heldCountText(40));
}

export async function holdingFrame(page: Page, phone: boolean): Promise<void> {
  await stageCrowd(page, phone, 15);
  await api(page, t => t.step(35));
  const { blocker, enemies } = await api(page, t => t.state());
  expect(enemies.filter(e => e.distance === blocker!.distance)).toHaveLength(15);
  expect(blocker!.hp).toBeLessThan(blocker!.maxHp);
  expect(await visibleTexts(page)).toContain(heldCountText(15));
  await page.evaluate(() => document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))));
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveScreenshot(phone ? 'phone-barricade-holding.png' : 'barricade-holding.png');
  if (process.env.M39_FRAMES) {
    await canvas.screenshot({ path: process.env.M39_FRAMES + '/m39-barricade-' + (phone ? 'phone' : 'holding') + '.png' });
  }
}
