import { test } from '@playwright/test';
import { placement } from './guards';

test('five touch targets and hold-to-place Guards on tablet', async ({ page }) => placement(page, true));
