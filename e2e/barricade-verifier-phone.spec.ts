import { test } from '@playwright/test';
import { crowd } from './barricade-crowd';

test('held walkers stay within 36 px and the wall shows the crowd count (phone)', async ({ page }) => crowd(page, true));
