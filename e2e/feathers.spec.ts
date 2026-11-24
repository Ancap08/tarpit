import { expect, test } from '@playwright/test';
import { count, onScene, startPlay } from './sound';
import { featherLabels, featherLooks } from './feathers';

for (const look of ['classic', 'painted', 'showpiece']) featherLooks(look, false);
featherLabels(false);

test('a barrel makes a puff on each enemy, with one sound per crowd and silence on the repeat', async ({ page }) => {
  test.setTimeout(60_000);
  await startPlay(page);
  const cast = await onScene(page, scene => {
    scene.state.wave = 3;
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
