import { expect, test } from '@playwright/test';
import { blockedWaveLabel, BOON_PENDING_TEXT, BOON_WAVE_TEXT, BOSS_WAVE_NEXT_TEXT, LAST_WAVE_TEXT } from '../src/game/names';
import { api, clearToOffer, expectActTwoPreviewsFit, expectOffer, expectStartLabelFits, mapPress, openCampaign, pickEachPosition, postSpawn, press } from './campaign';
import { waitForTitle } from './title';

test('a pending reward survives a live turn and a tap chooses once; reload starts fresh', async ({ page }) => {
  await openCampaign(page, true);
  expect(await api(page, (t) => t.layout())).toBe('portrait');
  await clearToOffer(page, 5);
  await expectOffer(page, 5);
  const before = await api(page, (t) => t.state());
  await expectStartLabelFits(page, blockedWaveLabel(true, BOON_PENDING_TEXT));
  await press(page, 'startWave', true);
  await press(page, 'bar:cannon', true);
  await mapPress(page, 7, 5, true);
  expect(await api(page, (t) => t.state())).toEqual(before);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => api(page, (t) => t.layout())).toBe('landscape');
  expect(await api(page, (t) => t.pendingBoon())).toEqual(before.pendingBoon);
  await expectOffer(page, 5);
  await press(page, 'reward:warChest', true);
  expect(await api(page, (t) => t.state())).toMatchObject({ tick: before.tick, wave: 5, gold: before.gold + 80, boons: ['warChest'], pendingBoon: null });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => api(page, (t) => t.layout())).toBe('portrait');
  await press(page, 'boon:warChest', true);
  expect(await api(page, (t) => t.ui().boonTooltip)).toBe('warChest');
  await clearToOffer(page, 10);
  await expectOffer(page, 10);
  await page.reload();
  await waitForTitle(page);
  await press(page, 'title:play', true);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 0, gold: 100, boons: [], pendingBoon: null });
});

test('each reward card position accepts a tap', ({ page }) => pickEachPosition(page, 'touch'));

test('all act-two previews fit in portrait', async ({ page }) => {
  await openCampaign(page, true);
  await expectActTwoPreviewsFit(page);
});

test('Call next displays each refusal inside the phone button', async ({ page }) => {
  await openCampaign(page, true);
  for (const [wave, reason] of [[4, BOON_WAVE_TEXT], [19, BOSS_WAVE_NEXT_TEXT], [20, LAST_WAVE_TEXT]] as const) {
    await postSpawn(page, wave);
    await expectStartLabelFits(page, blockedWaveLabel(false, reason));
    await press(page, 'startWave', true);
    expect(await api(page, (t) => t.state())).toMatchObject({ phase: 'wave', wave });
  }
});
