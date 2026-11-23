import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import { ACT_TWO_TEXT, GRUMBLEMAW_NAME, PACK_CALL_TEXT } from '../src/game/names';
import { openCampaign, press, visibleTexts } from './campaign';

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`Grumblemaw arrival, health bar, two pack calls and fall in live play (${motion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await openCampaign(page, false, true);
    if (motion === 'no-preference') {
      await page.evaluate(() => {
        const t = window.__tarpit!;
        const scene = t.game.scene.getScene('game') as GameScene;
        // Exercise scene events and actual buttons in live rendering without
        // playing ten setup waves. The next sim tick clears seeded wave 10.
        scene.state.wave = 9;
        scene.startWave();
        scene.state.spawnedPerGroup.fill(9999);
        scene.advance(1);
      });
      await press(page, 'reward:stickyTar');
      await press(page, 'startWave');
      await expect.poll(() => visibleTexts(page)).toContain(ACT_TWO_TEXT);
      expect(await page.evaluate(() => window.__tarpit!.audio().requested)).toMatchObject({ boonOffer: 1, boonPick: 1, act2: 1 });
    }
    const arrival = await page.evaluate(() => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      scene.state.phase = 'setup';
      scene.state.wave = 19;
      scene.state.lives = 1000;
      scene.state.enemies = [];
      scene.startWave();
      scene.advance(2892);
      const before = scene.hudStrings().boss;
      scene.advance(1);
      const boss = scene.state.enemies.find((enemy) => enemy.type === 'grumblemaw')!;
      return { before, after: scene.hudStrings().boss, sprite: t.animState(boss.id), fx: t.fx() };
    });
    expect(arrival.before).toBeNull();
    expect(arrival.after).toBe(`${GRUMBLEMAW_NAME} 5600 / 5600`);
    expect(arrival.sprite).toMatchObject({ texture: 'boss', scale: expect.any(Number) });
    expect(arrival.sprite!.scale).toBeGreaterThan(2);
    const reduced = motion === 'reduce';
    expect(arrival.fx).toMatchObject({ reducedMotion: reduced, bossEntrances: 1, darkenings: reduced ? 0 : 1, shakes: reduced ? 0 : 1 });
    await expect.poll(() => visibleTexts(page)).toContain(GRUMBLEMAW_NAME);
    await page.evaluate(() => {
      // Isolate the boss from the scheduled escorts so only his packs can
      // hold the wave open after he falls.
      const scene = window.__tarpit!.game.scene.getScene('game') as GameScene;
      scene.state.enemies = scene.state.enemies.filter((enemy) => enemy.type === 'grumblemaw');
    });

    const callPack = (threshold: 1 | 2) => page.evaluate((threshold) => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      const boss = scene.state.enemies.find((enemy) => enemy.type === 'grumblemaw')!;
      boss.hp = Math.ceil(5600 * threshold / 3) + 5;
      scene.state.specialCharges = 1; // independently probe each threshold
      const cave = scene.state.map.path[0];
      const hit = scene.useSpecialAt('keg', cave.x, cave.y);
      const cue = scene.uiState().packCue;
      const bar = scene.hudStrings().boss;
      const events = scene.state.events.filter((e) => e.kind === 'packCall');
      const count = scene.state.enemies.filter((enemy) => enemy.type === 'wolf').length;
      scene.advance(1);
      const wolvesAdded = scene.state.enemies.filter((enemy) => enemy.type === 'wolf').length - count;
      return { hit, cue, bar, events, wolvesAdded };
    }, threshold);

    const first = await callPack(2);
    expect(first).toMatchObject({ hit: { ok: true }, cue: true, bar: `${GRUMBLEMAW_NAME} 3679 / 5600`, wolvesAdded: 1 });
    expect(first.events).toEqual([expect.objectContaining({ threshold: 2 })]);
    await expect.poll(() => visibleTexts(page)).toContain(PACK_CALL_TEXT);
    const second = await callPack(1);
    expect(second).toMatchObject({ hit: { ok: true }, cue: true, bar: `${GRUMBLEMAW_NAME} 1812 / 5600` });
    expect(second.events).toEqual([expect.objectContaining({ threshold: 1 })]);

    const fall = await page.evaluate(() => {
      const t = window.__tarpit!;
      const scene = t.game.scene.getScene('game') as GameScene;
      const boss = scene.state.enemies.find((enemy) => enemy.type === 'grumblemaw')!;
      boss.hp = 1;
      scene.state.specialCharges = 1;
      const cave = scene.state.map.path[0];
      scene.useSpecialAt('keg', cave.x, cave.y);
      scene.advance(3);
      return { bar: scene.hudStrings().boss, phase: scene.state.phase, packs: scene.state.packs.length, fx: t.fx(), audio: t.audio().requested };
    });
    expect(fall.bar).toBeNull();
    expect(fall.phase).toBe('wave');
    expect(fall.packs).toBeGreaterThan(0);
    expect(fall.fx!.impacts).toBeGreaterThanOrEqual(3);
    expect(fall.fx).toMatchObject({ bossEntrances: 1, bossDeaths: 1, screenFlashes: reduced ? 0 : 1 });
    if (reduced) expect(fall.fx).toMatchObject({ shakes: 0, darkenings: 0, camera: { x: 0, y: 0, split: false } });
    expect(fall.audio).toMatchObject({ grumblemawArrive: 1, packCall: 2, grumblemawFall: 1 });
    expect(fall.audio.bossArrive).toBeUndefined();
    expect(fall.audio.bossFall).toBeUndefined();
  });
}
