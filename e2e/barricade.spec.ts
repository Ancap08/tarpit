import { expect, test } from '@playwright/test';
import { aimBarricade, aimCases, castAt, hintAndRestart, startBarricadeWave } from './barricade';
import type { GameScene } from '../src/game/GameScene';
import { BARRICADE_HP } from '../src/sim/blockers';
import { api, openCampaign, press } from './campaign';
import { ui } from './phone';

test('mouse casts, trail corners, map edges and refusal labels', async ({ page }) => aimCases(page, false));
test('wave 3 unlock hint once per visit, Play again and Menu', async ({ page }) => hintAndRestart(page));

test('walkers hit the wall, a Harpy passes and the crowd walks on after the break', async ({ page }) => {
  await startBarricadeWave(page, 7);
  await aimBarricade(page);
  await castAt(page, { x: 100, y: 250 });
  await api(page, t => {
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    s.enemies = Array.from({ length: 11 }, (_, i) => ({
      id: s.nextEnemyId++, type: i === 10 ? 'harpy' : 'goblin', distance: 99, hp: 23, slow: 0, slowTicksLeft: 0,
    }));
    t.step(200);
  });
  expect((await ui(page)).special.blocker).toMatchObject({ hp: BARRICADE_HP - 200, maxHp: BARRICADE_HP });
  expect(await api(page, t => t.state().enemies.map(e => e.distance))).toEqual([...Array(10).fill(100), 399]);
  await page.evaluate(n => window.__tarpit!.step!(n), BARRICADE_HP - 200);
  expect((await ui(page)).special.blocker).toBeNull();
  expect(await api(page, t => t.events().some(e => e.kind === 'blockerBreak'))).toBe(true);
  await api(page, t => t.step(1));
  expect(await api(page, t => t.state().enemies[0].distance)).toBe(101);
  await press(page, 'special');
  expect((await ui(page)).special).toMatchObject({ menuOpen: false, ready: false });
  await page.evaluate(n => window.__tarpit!.step!(n), 1200 - BARRICADE_HP - 1);
  await press(page, 'special');
  await press(page, 'special:keg');
  await castAt(page, { x: 450, y: 385 });
  expect((await ui(page)).special).toMatchObject({ rechargeTicks: 1200, charges: 0 });
});

test('a Powder Keg aimed at the farthest drawn Goblin hits all fifteen held Goblins', async ({ page }) => {
  await startBarricadeWave(page, 3);
  await aimBarricade(page);
  await castAt(page, { x: 420, y: 164 });
  const target = await api(page, t => {
    const s = t.state();
    const wall = s.blocker!;
    s.spawnedPerGroup.fill(9999);
    s.enemies = Array.from({ length: 15 }, () => ({
      id: s.nextEnemyId++, type: 'goblin', distance: wall.distance - 1, hp: 23, slow: 0, slowTicksLeft: 0,
    }));
    s.specialCharges = 1;
    t.step(1);
    const held = s.enemies.filter(e => e.distance === wall.distance);
    const positions = held.map(e => t.animState(e.id)!);
    const gap = (p: { x: number; y: number }) => Math.hypot(p.x - wall.x, p.y - wall.y);
    const farthest = positions.reduce((a, b) => gap(a) >= gap(b) ? a : b);
    return { x: farthest.x, y: farthest.y, held: held.length, gap: gap(farthest) };
  });
  expect(target.held).toBe(15);
  expect(target.gap).toBeGreaterThan(0);
  await press(page, 'special');
  await press(page, 'special:keg');
  await castAt(page, target);
  expect(await api(page, t => t.events().find(e => e.kind === 'special' && e.type === 'keg')))
    .toMatchObject({ x: target.x, y: target.y, hits: 15 });
  expect(await api(page, t => t.state().enemies.length)).toBe(0);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Grumblemaw hits and smashes the wall in live play (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await openCampaign(page, false, true);
    const samples = await page.evaluate(async () => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      const s = scene.state;
      s.wave = 19;
      scene.startWave();
      s.spawnedPerGroup.fill(9999);
      const id = s.nextEnemyId++;
      s.enemies = [{ type: 'grumblemaw', id, hp: 21280, maxHp: 21280, distance: 99.9, slow: 0, slowTicksLeft: 0 }];
      const cast = scene.useSpecialAt('barricade', 100, 240);
      const seen = { contact: false, shake: false, lunge: false, hpFell: false, crash: false, onward: false };
      const end = performance.now() + 7000;
      do {
        await new Promise(requestAnimationFrame);
        const special = scene.uiState().special;
        const wall = special.blocker;
        if (wall) {
          seen.contact ||= wall.attackers.includes(id);
          seen.hpFell ||= wall.hp < wall.maxHp;
          seen.shake ||= Math.abs(wall.shake) > 0.01;
          seen.lunge ||= (t.animState(id)?.blockerLunge ?? 0) > 0.01;
        }
        seen.crash ||= special.barricadeCrash !== null;
        seen.onward ||= !wall && s.enemies.some(e => e.id === id && e.distance > 100);
      } while ((!seen.crash || !seen.onward) && performance.now() < end);
      return { cast, seen, sounds: t.audio().requested };
    });
    expect(samples.cast.ok).toBe(true);
    const motion = reducedMotion === 'no-preference';
    expect(samples.seen).toEqual({ contact: true, shake: motion, lunge: motion, hpFell: true, crash: true, onward: true });
    expect(samples.sounds['special.barricade']).toBe(1);
    expect(samples.sounds.blockerHit).toBeGreaterThan(0);
    expect(samples.sounds.blockerBreak).toBe(1);
  });
}
