import { test } from '@playwright/test';
import { crowd } from './barricade-crowd';

test('a crowd of fifteen held at the wall (desktop)', async ({ page }) => crowd(page, false, 'desktop'));
