import { expect, test } from '@playwright/test';
import type { TitleUiState } from '../src/game/TitleScene';
import { api, state, tap, tapCell } from './phone';
import { painted, waitForGame } from './painted';
import { waitForTitle } from './title';

test('landscape touch Look plays Painted and two taps still build', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForTitle(page);
  await tap(page, 'title:look:painted');
  expect(await api(page, (a) => a.ui<TitleUiState>().look)).toBe('painted');
  await tap(page, 'title:play');
  await waitForGame(page);
  await expect.poll(() => painted(page)).toMatchObject({ active: true, density: 1 });
  expect(await api(page, (a) => a.layout())).toBe('landscape');
  const cell = { col: 7, row: 5 };
  await tap(page, 'bar:musketeer');
  await tapCell(page, cell);
  await tapCell(page, cell);
  expect((await state(page)).towers).toContainEqual(expect.objectContaining({ cell, type: 'musketeer' }));
});
