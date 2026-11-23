import { expect, test } from '@playwright/test';
import { cellPage } from './phone';
import { click, painted, settle } from './painted';
import { waitForTitle } from './title';

for (const [map, trailRow] of [['meadow', 7], ['switchback', 3], ['riverbend', 12]] as const) {
  test(`Painted ${map} shows a two-tone placement frame and crosses a blocked cell`, async ({ page }) => {
    await page.goto('/?test=1&look=painted');
    await waitForTitle(page);
    await page.evaluate((map) => window.__tarpit!.startGame!('normal', map), map);
    await expect.poll(() => painted(page)).toMatchObject({ active: true });
    await click(page, 'bar:musketeer');

    for (const cell of [{ col: 7, row: 5 }, { col: 2, row: trailRow }]) {
      const p = await cellPage(page, cell);
      await page.mouse.move(p.x, p.y);
      await settle(page);
      const { rim, rail, cross, beside } = await page.evaluate(({ col, row }) => {
        const ctx = window.__tarpit!.game.canvas.getContext('2d')!;
        const luma = (x: number, y: number) => {
          const [r, g, b] = ctx.getImageData(col * 32 + x, row * 32 + y, 1, 1).data;
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        return { rim: luma(0, 27), rail: luma(2, 27), cross: luma(9, 9), beside: luma(15, 8) };
      }, cell);
      expect(rail - rim).toBeGreaterThan(100);
      if (cell.row === trailRow) expect(beside - cross).toBeGreaterThan(60);
    }
  });
}
