import { test } from '@playwright/test';
import { crowd } from './barricade-crowd';

test('a crowd of fifteen held at the wall (phone)', async ({ page }) => crowd(page, true, 'phone'));
