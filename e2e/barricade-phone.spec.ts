import { expect, test } from '@playwright/test';
import { aimBarricade, aimCases, castAt, startBarricadeWave } from './barricade';
import { api } from './campaign';
import { ui, worldPage, toPage } from './phone';

test('phone tap refusals and magnified hold on a trail corner', async ({ page }) => aimCases(page, true, true));

test('a tap places the wall and turning the phone keeps it across the trail', async ({ page }) => {
  await startBarricadeWave(page, 7, true);
  await aimBarricade(page, true);
  await castAt(page, { x: 170, y: 130 }, true);
  const before = await api(page, t => t.state().blocker);
  expect(before).toMatchObject({ x: 160, hp: 400 });
  for (const portrait of [true, false]) {
    if (!portrait) {
      await page.setViewportSize({ width: 844, height: 390 });
      await expect.poll(() => api(page, t => t.layout())).toBe('landscape');
    }
    const wall = (await ui(page)).special.blocker!;
    const screen = await toPage(page, wall.point);
    expect(screen).toEqual(await worldPage(page, before!));
    expect(await api(page, t => t.state().blocker)).toEqual(before);
  }
});
