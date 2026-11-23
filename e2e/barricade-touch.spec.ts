import { test } from '@playwright/test';
import { aimCases } from './barricade';
test('tablet tap refusals and hold to snap at a trail corner', async ({ page }) => aimCases(page, true));
