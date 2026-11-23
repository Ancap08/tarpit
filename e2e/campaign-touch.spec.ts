import { campaignPurchaseCase } from './campaignPurchases';
import { expect, test } from '@playwright/test';
import { api, clearToOffer, expectOffer, mapPress, openCampaign, pickEachPosition, press } from './campaign';

test('tablet taps can choose a card but cannot reach a selected tower under the modal', async ({ page }) => {
  await openCampaign(page, true);
  expect(await api(page, (t) => t.layout())).toBe('landscape');
  expect(await api(page, (t) => t.buildAt(7, 1, 'cannon'))).toMatchObject({ ok: true });
  await clearToOffer(page, 15);
  await expectOffer(page, 15);
  await mapPress(page, 7, 1, true);
  await press(page, 'startWave', true);
  expect(await api(page, (t) => t.ui())).toMatchObject({ panelOpen: false, selectedCell: null });
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 15, phase: 'setup' });
  await press(page, 'reward:biggerBlasts', true);
  expect(await api(page, (t) => t.heldBoons())).toEqual(['biggerBlasts']);
  await press(page, 'boon:biggerBlasts', true);
  expect(await api(page, (t) => t.ui().boonTooltip)).toBe('biggerBlasts');
  await press(page, 'startWave', true);
  expect(await api(page, (t) => t.state())).toMatchObject({ wave: 16, phase: 'wave' });
});

test('each reward card position accepts a tap', ({ page }) => pickEachPosition(page, 'touch'));

campaignPurchaseCase(true);
