import { test } from '@playwright/test';
import { muteRoundTrip } from './sound';

// Milestone 33 (sound), tablet project (1024 x 768 touch, landscape): the
// mute buttons on the title and in the HUD by touch. 42 canvas px is 44.8
// CSS px at this scale.

test('the mute buttons by touch: 42 px, overlapping nothing, muting and unmuting', async ({ page }) => {
  await muteRoundTrip(page, true, 42);
});
