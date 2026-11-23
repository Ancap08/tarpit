import { test } from '@playwright/test';
import { crowd } from './barricade-crowd';

test('one to twenty held walkers occupy distinct screen positions (phone)', async ({ page }) => crowd(page, true));
