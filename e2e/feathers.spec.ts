import { expect, test } from '@playwright/test';
import { count, onScene, startPlay } from './sound';
import { press } from './campaign';
import { waitForFirstScreen } from './title';
import { featherLabels, featherLooks } from './feathers';

for (const look of ['classic', 'painted', 'showpiece']) featherLooks(look, false);
featherLabels(false);

test('a barrel is silent for feathers until a path B shot triggers one puff', async ({ page }) => {
  test.setTimeout(60_000);
  await startPlay(page);
  const cast = await onScene(page, scene => {
    const cell = { col: 7, row: 4 };
    if (!scene.build(cell, 'tarpit').ok || !scene.upgrade(cell).ok || !scene.upgrade(cell, 'B').ok)
      throw new Error('Could not build Feathers on the bend');
    scene.state.wave = 3;
    scene.startWave();
    scene.spawnHorde(1);
    scene.state.enemies[0].distance = 364;
    scene.state.spawnedPerGroup.fill(999);
    const first = scene.useSpecialAt('tarBarrel', 220, 96);
    const afterBarrel = window.__tarpit!.audio().requested['impact.feathers'] ?? 0;
    scene.advance(1);
    scene.state.specialCharges = 1;
    scene.state.specialRechargeTicks = 0;
    const second = scene.useSpecialAt('tarBarrel', 220, 96);
    return { both: first.ok && second.ok, afterBarrel };
  }, null);
  expect(cast).toEqual({ both: true, afterBarrel: 0 });
  expect(await count(page, 'requested', 'impact.feathers')).toBe(1);
  expect(await count(page, 'played', 'impact.feathers')).toBe(1);
});

test('a feather barrel makes one puff per enemy and one sound per crowd on level 14', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const stars = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [i + 1, 2]));
    localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 1, stars }));
    localStorage.setItem('tarpit.seenTips', '[14]');
  });
  await page.goto('/?renderer=canvas&perf=1');
  await waitForFirstScreen(page);
  await press(page, 'title:campaign');
  await page.waitForFunction(() => window.__tarpit!.titleReady() && window.__tarpit!.uiRects()['title:stop:14']);
  await press(page, 'title:stop:14');
  await page.waitForFunction(() => window.__tarpit!.titleReady() && window.__tarpit!.uiRects()['title:play']);
  await press(page, 'title:play');
  await page.waitForFunction(() => window.__tarpit!.game.scene.isActive('game') && window.__tarpit!.audio().context === 'running');
  const cast = await onScene(page, scene => {
    scene.startWave();
    scene.spawnHorde(30, 60);
    scene.state.spawnedPerGroup.fill(999);
    const first = scene.useSpecialAt('tarBarrel', 32, 240);
    const puffs = (scene as unknown as { featherPuffs: { bursts: unknown[] } }).featherPuffs;
    const firstPuffs = puffs.bursts.length;
    scene.advance(1);
    scene.state.specialCharges = 1;
    scene.state.specialRechargeTicks = 0;
    const second = scene.useSpecialAt('tarBarrel', 32, 240);
    return { first: first.ok, second: second.ok, firstPuffs, afterRepeat: puffs.bursts.length };
  }, null);
  expect(cast).toEqual({ first: true, second: true, firstPuffs: 30, afterRepeat: 30 });
  expect(await count(page, 'requested', 'impact.feathers')).toBe(1);
  expect(await count(page, 'played', 'impact.feathers')).toBe(1);
});
