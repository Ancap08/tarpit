import { test } from '@playwright/test';
import { popupFits } from './guardsVerifier';

test('five specials fit on the tablet', async ({ page }) => popupFits(page, true, false));
