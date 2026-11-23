import { test } from '@playwright/test';
import { crowd } from './barricade-crowd';

test('one to twenty held walkers occupy distinct screen positions (desktop)', async ({ page }) => crowd(page, false));
