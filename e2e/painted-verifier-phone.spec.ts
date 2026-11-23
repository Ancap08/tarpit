import { expect, test } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import { tap } from './phone';
import { waitForGame, painted } from './painted';
import { hitAreaCase } from './paintedVerifier';
import { waitForTitle } from './title';

const look = (page: import('@playwright/test').Page) => page.evaluate(() => (window.__tarpit!.game.scene.getScene('title') as unknown as { uiState(): TitleUiState }).uiState().look);

test('E phone hit areas: a touch tap on the painted body above the cell and on the cell act as in Classic', async ({ page }) => {
  const touch = (x: number, y: number) => page.touchscreen.tap(x, y);
  const c = await hitAreaCase(page, 'classic', touch);
  const p = await hitAreaCase(page, 'painted', touch);
  console.log('E phone hit areas', JSON.stringify({ c, p }));
  expect(p).toEqual(c);
  expect((c.cell as { open: boolean }).open).toBe(true);
});

test('D phone: touch picks Painted, it is remembered, 3x device ratio asks for 2x only, and Classic is one tap back', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/painted/')) requests.push(new URL(r.url()).pathname); });
  await page.goto('/');
  await waitForTitle(page);
  expect(await look(page)).toBe('classic');
  await tap(page, 'title:look:painted');
  await page.reload();
  await waitForTitle(page);
  expect(await look(page)).toBe('painted');
  await tap(page, 'title:play');
  await waitForGame(page);
  const s = await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as unknown as { paintedState(): { active: boolean; density: number } }).paintedState());
  expect(s).toMatchObject({ active: true, density: 2 });
  expect(requests.filter((u) => u.includes('-1x-'))).toEqual([]);
  expect(requests.length).toBe(54);
  void painted;
});
