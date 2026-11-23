import { test } from '@playwright/test';
import { placement } from './guards';

test('phone Guards popup fits the map, hold placement matches the marks and survives rotation', async ({ page }) => placement(page, true, true));
