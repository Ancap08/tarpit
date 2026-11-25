import { expect, test } from '@playwright/test';
import { count, onScene, startPlay } from './sound';
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
