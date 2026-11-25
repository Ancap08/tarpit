// Verifier checks of the milestone 52a gate HUD: the plain gate plaque and the
// Repair control against every other control, panel and visible text, with a
// tower selected on each build site, tips on, and each font mode.
import { expect, test, type Page } from '@playwright/test';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import { rectPage } from './phone';

type Box = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function boxes(page: Page) {
  return page.evaluate(() => {
    const api = window.__tarpit!;
    const rects = Object.entries(api.uiRects()).map(([id, r]) => ({ id, left: r.x, right: r.x + r.width, top: r.y, bottom: r.y + r.height }));
    const scene = api.game.scene.getScene('game');
    const text = scene.children.list
      .filter(o => o.type === 'Text' && (o as Phaser.GameObjects.Text).visible && (o as Phaser.GameObjects.Text).text.trim() !== '')
      .map(o => {
        const t = o as Phaser.GameObjects.Text;
        const b = t.getBounds();
        return { id: t.text, left: b.left, right: b.right, top: b.top, bottom: b.bottom };
      });
    return { rects, text, canvas: { w: api.game.scale.width, h: api.game.scale.height } };
  });
}

export function siegeVerifierCases(heights: readonly (number | undefined)[]) {
  for (const height of heights) for (const metrics of ['normal', 'fixed Caslon', 'wide']) {
    test(`gate HUD against panels and text with a tower selected on every site (${height ?? 'project size'}, ${metrics})`, async ({ page }) => {
      test.setTimeout(180_000);
      if (height) await page.setViewportSize({ width: 390, height });
      if (metrics === 'wide') await useWideFontMetrics(page, process.platform === 'darwin' ? 1.09 : 1.06);
      if (metrics === 'fixed Caslon') await useTallFontMetrics(page, false);
      await page.goto('/?keep=1&test=1');
      await page.waitForFunction(() => window.__tarpit?.keep?.() && !!window.__tarpit.uiRects().gate, null, { timeout: 40_000 });
      await page.evaluate(() => {
        const api = window.__tarpit!;
        api.setTipsEnabled!(true);
        api.state!().gate!.hp = 312;
        api.state!().gold = 1000;
        api.step!(0);
      });
      const sites = await page.evaluate(() => window.__tarpit!.state!().map.buildSites!.map(c => ({ ...c })));
      const failures: string[] = [];
      let checked = 0;
      for (const site of sites) {
        const built = await page.evaluate(({ col, row }) => window.__tarpit!.buildAt!(col, row, 'musketeer').ok, site);
        if (!built) continue;
        const at = await page.evaluate(({ col, row }) => window.__tarpit!.cellToPage!(col, row), site);
        await page.mouse.click(at.x, at.y);
        await page.evaluate(() => window.__tarpit!.step!(0));
        checked++;
        const { rects, text, canvas } = await boxes(page);
        const own = rects.filter(r => ['gate', 'repair'].includes(r.id));
        expect(own.map(r => r.id).sort(), `${site.col},${site.row} controls present`).toEqual(['gate', 'repair']);
        for (const box of own) {
          if (box.left < -0.5 || box.top < -0.5 || box.right > canvas.w + 0.5 || box.bottom > canvas.h + 0.5) failures.push(`${box.id} off canvas`);
          for (const other of rects.filter(r => r.id !== box.id && !['gate', 'repair'].includes(r.id))) {
            if (overlaps(box, other)) failures.push(`${site.col},${site.row}: ${box.id} overlaps rect ${other.id}`);
          }
          for (const t of text) {
            const inside = t.left >= own[0].left - 1 && t.right <= own[0].right + 1 && t.top >= own[0].top - 1 && t.bottom <= own[0].bottom + 1;
            const insideRepair = t.left >= own[1].left - 1 && t.right <= own[1].right + 1 && t.top >= own[1].top - 1 && t.bottom <= own[1].bottom + 1;
            if (!inside && !insideRepair && overlaps(box, t)) failures.push(`${site.col},${site.row}: ${box.id} overlaps text "${t.id}"`);
          }
        }
      }
      expect(checked, 'sites exercised').toBeGreaterThanOrEqual(8);
      expect([...new Set(failures)]).toEqual([]);
    });
  }

  test('Repair does nothing while paused, and a tap on its place does not leak into the map', async ({ page }) => {
    await page.goto('/?keep=1&test=1');
    await page.waitForFunction(() => window.__tarpit?.keep?.() && !!window.__tarpit.uiRects().gate, null, { timeout: 40_000 });
    await page.evaluate(() => { window.__tarpit!.state!().gate!.hp = 100; window.__tarpit!.state!().gold = 500; window.__tarpit!.step!(0); });
    const r = await rectPage(page, 'repair');
    await page.evaluate(() => window.__tarpit!.pause!());
    await page.mouse.click(r.x, r.y);
    expect(await page.evaluate(() => [window.__tarpit!.state!().gate!.hp, window.__tarpit!.state!().gold])).toEqual([100, 500]);
    await page.evaluate(() => window.__tarpit!.resume!());
    await page.mouse.click(r.x, r.y);
    expect(await page.evaluate(() => [window.__tarpit!.state!().gate!.hp, window.__tarpit!.state!().gold])).toEqual([260, 470]);
  });

  test('with the switch off there is no gate control, rectangle or DOM button', async ({ page }) => {
    await page.goto('/?test=1');
    await page.evaluate(() => window.__tarpit!.startGame!('normal', 'meadow'));
    await page.waitForFunction(() => window.__tarpit?.state?.());
    const keys = await page.evaluate(() => Object.keys(window.__tarpit!.uiRects()));
    expect(keys.filter(k => k === 'gate' || k === 'repair')).toEqual([]);
    expect(await page.locator('.repair-action').count()).toBe(0);
    expect(await page.evaluate(() => window.__tarpit!.state!().gate)).toBeUndefined();
  });
}
