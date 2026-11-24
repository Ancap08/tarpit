import { expect, test } from '@playwright/test';
import { count, onScene, startPlay } from './sound';
import { featherLabels, featherLooks } from './feathers';

for (const look of ['classic', 'painted', 'showpiece']) featherLooks(look, false);
featherLabels(false);

test('a crowd makes one puff on its first barrel and stays silent on its second', async ({ page }) => {
  test.setTimeout(60_000);
  await startPlay(page);
  const cast = await onScene(page, scene => {
    scene.state.wave = 3;
    scene.startWave();
    scene.spawnHorde(5, 4);
    scene.state.spawnedPerGroup.fill(999);
    const first = scene.useSpecialAt('tarBarrel', 2, 240);
    scene.advance(1);
    scene.state.specialCharges = 1;
    scene.state.specialRechargeTicks = 0;
    const second = scene.useSpecialAt('tarBarrel', 2, 240);
    return [first.ok, second.ok];
  }, null);
  expect(cast).toEqual([true, true]);
  expect(await count(page, 'requested', 'impact.feathers')).toBe(1);
  expect(await count(page, 'played', 'impact.feathers')).toBe(1);
});
