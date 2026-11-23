// Milestone 39 verifier helper: a crowd held at the wall. Frames go to M39_FRAMES when set.
import { expect, type Page } from '@playwright/test';
import { startBarricadeWave, aimBarricade, castAt } from './barricade';
import { api } from './campaign';
import { toPage, ui } from './phone';

export async function crowd(page: Page, phone: boolean, tag: string): Promise<void> {
  await startBarricadeWave(page, 7, phone);
  await api(page, (t) => {
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    const types = ['goblin', 'goblin', 'goblin', 'goblin', 'goblin', 'goblin', 'wolf', 'wolf', 'wolf', 'shieldbearer', 'shieldbearer', 'shieldbearer', 'troll', 'troll', 'harpy'] as const;
    s.enemies = types.map((type, i) => ({
      id: s.nextEnemyId++, type, hp: type === 'troll' ? 950 : type === 'shieldbearer' ? 70 : type === 'harpy' ? 36 : 23,
      distance: 772 - 1.5 * i, slow: 0, slowTicksLeft: 0,
    }));
    t.step(1);
  });
  await aimBarricade(page, phone);
  await castAt(page, { x: 420, y: 312 }, phone);
  await api(page, (t) => t.step(60));
  const info = await page.evaluate(() => {
    const t = window.__tarpit as unknown as { state(): { blocker: { distance: number; hp: number } | null; enemies: { id: number; type: string; distance: number }[] }; animState(id: number): { sx?: number; sy?: number } | undefined };
    const s = t.state();
    const at = s.enemies.filter((e) => e.type !== 'harpy' && s.blocker && e.distance === s.blocker.distance);
    const pts = at.map((e) => { const a = t.animState(e.id); return `${Math.round(a?.sx ?? -1)},${Math.round(a?.sy ?? -1)}`; });
    return { held: at.length, distinct: new Set(pts).size, hp: s.blocker?.hp, types: [...new Set(at.map((e) => e.type))] };
  });
  console.log(`CROWD ${tag}`, JSON.stringify(info));
  expect(info.held).toBeGreaterThanOrEqual(8);
  const wall = (await ui(page)).special.blocker!;
  const p = await toPage(page, wall.point);
  expect(p.x).toBeGreaterThan(0);
  if (process.env.M39_FRAMES) await page.locator('canvas').screenshot({ path: `${process.env.M39_FRAMES}/verifier-crowd-${tag}.png` });
}

