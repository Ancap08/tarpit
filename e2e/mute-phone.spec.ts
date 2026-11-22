import { expect, test } from '@playwright/test';
import { muteRoundTrip } from './sound';
import { rectPageSize } from './phone';

// Milestone 33 (sound), phone project (390 x 844 touch, portrait): the
// mute buttons on the title (top right) and at the end of controls row 2,
// 70 canvas px like the other portrait controls.

test('the mute buttons by touch in portrait: 70 px, overlapping nothing, muting and unmuting', async ({ page }) => {
  await muteRoundTrip(page, true, 70);
  const size = await rectPageSize(page, 'mute');
  expect(Math.min(size.width, size.height)).toBeGreaterThanOrEqual(44);
});
