import { expect, test } from '@playwright/test';
import { GUARDS_UNLOCKED, GUARDS_UNLOCK_HINT } from '../src/game/names';
import type { GameScene } from '../src/game/GameScene';
import { GUARD_COUNT, GUARD_LIFETIME_TICKS } from '../src/sim/blockers';
import { api, openCampaign, press, visibleTexts } from './campaign';
import { castAt, startBarricadeWave } from './barricade';
import { placement } from './guards';
import { ui } from './phone';
import { waitForTitle } from './title';

test('mouse placements use five full-size targets and the four previewed guard positions', async ({ page }) => placement(page, false));

test('wave six hint once per visit, clean Play again and Menu', async ({ page }) => {
  await startBarricadeWave(page, 6);
  await api(page, t => t.step(15));
  expect((await ui(page)).momentBanner).toBe(GUARDS_UNLOCKED);
  expect(await visibleTexts(page)).toContain(GUARDS_UNLOCK_HINT);
  for (const key of ['playAgain', 'menu']) {
    await press(page, 'special');
    await press(page, 'special:guards');
    await castAt(page, { x: 180, y: 96 });
    expect((await ui(page)).special.guards).toHaveLength(GUARD_COUNT);
    await api(page, t => {
      const s = t.state();
      s.lives = 1;
      s.enemies = [{ id: s.nextEnemyId++, type: 'wolf', hp: 20, distance: 1583, slow: 0, slowTicksLeft: 0 }];
      t.step(1);
    });
    await press(page, key);
    if (key === 'menu') {
      await waitForTitle(page);
      await press(page, 'title:play');
    }
    await page.waitForFunction(() => window.__tarpit?.scene?.() === 'game' && window.__tarpit.state?.().wave === 0);
    expect(await api(page, t => t.state().blockers)).toEqual([]);
    expect((await ui(page)).special).toMatchObject({ guards: [], guardsAim: null, labels: [] });
    await api(page, t => { t.state().wave = 5; t.startWave(); t.step(15); });
    expect(await visibleTexts(page)).not.toContain(GUARDS_UNLOCK_HINT);
  }
});

test('surviving guards depart on their last tick and every departure cue clears', async ({ page }) => {
  await startBarricadeWave(page, 6);
  await api(page, t => {
    const s = t.state();
    s.spawnedPerGroup.fill(9999);
    s.enemies = [{ id: s.nextEnemyId++, type: 'troll', distance: 0, hp: 950, slow: 0, slowTicksLeft: 0 }];
    t.useSpecialAt('guards', 860, 192);
  });
  await page.evaluate(n => window.__tarpit!.step!(n - 1), GUARD_LIFETIME_TICKS);
  expect((await ui(page)).special.guards.filter(g => g.hpBar !== null)).toHaveLength(GUARD_COUNT);
  await api(page, t => t.step(1));
  const poses = (await ui(page)).special.guards.map(g => g.animation);
  expect(poses).toEqual(Array(GUARD_COUNT).fill('leave'));
  await api(page, t => t.step(60));
  expect((await ui(page)).special.guards).toEqual([]);
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test('boss walks through the painted squad with ' + reducedMotion + ' motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => localStorage.setItem('tarpit.look', 'painted'));
    await openCampaign(page, false, true);
    const result = await page.evaluate(async () => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      const s = scene.state;
      s.wave = 9;
      scene.startWave();
      s.spawnedPerGroup.fill(9999);
      const id = s.nextEnemyId++;
      s.enemies = [{ id, type: 'boss', distance: 62, hp: 4000, maxHp: 4000, slow: 0, slowTicksLeft: 0 }];
      const cast = scene.useSpecialAt('guards', 100, 240);
      const seen = { contact: false, strike: false, wounded: false, fall: false, cleared: false };
      const limit = performance.now() + 8000;
      do {
        await new Promise(requestAnimationFrame);
        const draw = scene.uiState().special.guards;
        seen.contact ||= s.blockers.some(b => b.distance === s.enemies[0]?.distance);
        seen.strike ||= draw.some(g => g.animation === 'strike' && g.frame! % 2 === 1);
        seen.wounded ||= draw.some(g => g.hpBar && g.hp < g.maxHp && g.hpBar.fillWidth < g.hpBar.width - 2);
        seen.fall ||= draw.some(g => g.animation === 'fall' && g.hpBar === null);
        seen.cleared ||= !draw.length && s.enemies[0]?.distance > 100;
      } while (!seen.cleared && performance.now() < limit);
      // Run the remaining scene lifecycle in the painted display list. A fresh
      // squad spends its full lifetime behind the boss, then every image leaves.
      const guardImages = () => scene.paintedState().sprites.filter(p => p.key.includes(':guard:')).length;
      const afterFalls = guardImages();
      s.specialCharges = 1;
      const second = scene.useSpecialAt('guards', 80, 240);
      const standing = guardImages();
      scene.advance(720);
      const saluting = scene.uiState().special.guards.filter(g => g.animation === 'leave').length;
      scene.update(0, 800);
      const afterLeave = guardImages();
      return { cast, seen, second, afterFalls, standing, saluting, afterLeave, sounds: t.audio().requested };
    });
    expect(result.cast.ok).toBe(true);
    expect(result.seen).toEqual({ contact: true, strike: reducedMotion === 'no-preference', wounded: true, fall: true, cleared: true });
    expect(result).toMatchObject({ second: { ok: true }, afterFalls: 0, standing: GUARD_COUNT, saluting: GUARD_COUNT, afterLeave: 0 });
    expect(result.sounds.guardLeave).toBe(1);
    expect(result.sounds['special.guards']).toBe(2);
    expect(result.sounds.guardStrike).toBeGreaterThan(0);
    expect(result.sounds.guardDown).toBe(GUARD_COUNT);
  });
}
