// Milestone 44b verifier: each painted Guard keeps one of four outfits (frame group = id % 4) for its whole life.
import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { openCampaign } from './campaign';

test('painted guards keep their outfit through fights, speed 3x, blur, a layout switch and a second squad', async ({ page }) => {
  // Live play, counted in real frames: about 12 s on a Mac, and it reached the 30 s limit on the CI runner.
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
  await openCampaign(page, false, true);
  const probe = (frames: number) => page.evaluate(async frames => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const seen = new Map<number, Set<number>>();
    const standing: number[] = [];
    const bad: string[] = [];
    for (let i = 0; i < frames; i++) {
      await new Promise(requestAnimationFrame);
      const guards = scene.uiState().special.guards;
      standing.push(guards.filter(g => g.animation !== 'fall' && g.animation !== 'leave').length);
      for (const g of guards) {
        if (g.frame === null) { bad.push(`guard ${g.id} no frame`); continue; }
        const group = Math.floor(g.frame / 8);
        if (group !== g.id % 4) bad.push(`guard ${g.id} group ${group}`);
        (seen.get(g.id) ?? seen.set(g.id, new Set()).get(g.id)!).add(group);
      }
    }
    return { bad, ids: [...seen.keys()], multi: [...seen].filter(([, v]) => v.size > 1).length, minStanding: Math.min(...standing), maxStanding: Math.max(...standing) };
  }, frames);
  const setup = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const s = scene.state;
    s.wave = 9; scene.startWave(); s.spawnedPerGroup.fill(9999);
    s.enemies = [{ id: s.nextEnemyId++, type: 'boss', distance: 62, hp: 4000, maxHp: 4000, slow: 0, slowTicksLeft: 0 }];
    const first = scene.useSpecialAt('guards', 100, 240);
    scene.advance(2); s.specialCharges = 1; s.specialRechargeTicks = 0;
    const path = s.map.path;
    const lens = path.slice(1).map((q, i) => Math.hypot(q.x - path[i].x, q.y - path[i].y));
    let d = lens.reduce((a, b) => a + b, 0) * 0.6, k = 0;
    while (d > lens[k]) { d -= lens[k]; k++; }
    const second = scene.useSpecialAt('guards', path[k].x + (path[k + 1].x - path[k].x) * d / lens[k], path[k].y + (path[k + 1].y - path[k].y) * d / lens[k]);
    return { first, second, n: scene.uiState().special.guards.length };
  });
  expect(setup.first.ok && setup.second.ok, JSON.stringify(setup)).toBe(true);
  expect(setup.n).toBe(8);
  const a = await probe(30);
  await page.setViewportSize({ width: 390, height: 844 });
  const b = await probe(30);
  await page.setViewportSize({ width: 960, height: 580 });
  await page.evaluate(() => { (window.__tarpit!.game.scene.getScene('game') as GameScene).speed = 3; });
  const c = await probe(60);
  await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
  const d = await probe(30);
  // Wound, then kill two of the standing squad: a squad of fewer than four keeps its outfits.
  await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const guards = scene.state.blockers.filter(b => b.kind === 'guard');
    const mine = guards.filter(g => g.id >= 4);
    mine[0].hp = 1; mine[1].hp = 1;
    scene.state.enemies = [{ id: scene.state.nextEnemyId++, type: 'troll', hp: 950, maxHp: 950, distance: mine[0].distance, slow: 0, slowTicksLeft: 0 }];
  });
  const f = await probe(200);
  // Let the fight and the lifetime run so guards fall and leave.
  const e = await probe(400);
  for (const r of [a, b, c, d, f, e]) { expect(r.bad).toEqual([]); expect(r.multi).toBe(0); }
  console.log('standing min/max over phases', [a, b, c, d, f, e].map(r => [r.minStanding, r.maxStanding]));
});

test('classic guard drawing has no outfit frames', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tarpit.look', 'classic'));
  await openCampaign(page, false, true);
  const frames = await page.evaluate(() => {
    const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
    const s = scene.state;
    s.wave = 9; scene.startWave(); s.spawnedPerGroup.fill(9999);
    s.enemies = [];
    scene.useSpecialAt('guards', 100, 240);
    return scene.uiState().special.guards.map(g => g.frame);
  });
  expect(frames).toEqual([null, null, null, null]);
});
