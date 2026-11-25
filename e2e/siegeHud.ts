import { expect, test, type Page } from '@playwright/test';
import { useTallFontMetrics, useWideFontMetrics } from './campaignFont';
import type { GameScene } from '../src/game/GameScene';
import { checkLabel } from './hudButtonLabels';
import { rectPage, rectPageSize } from './phone';

async function checkGateLabels(page: Page, labels: string[], repair = false) {
  for (const label of labels) await checkLabel(page, 'gate', label);
  if (repair) await checkLabel(page, 'repair', 'Repair 30');
  const boxes = await page.evaluate(() => {
    const api = window.__tarpit!;
    const canvas = api.game.canvas.getBoundingClientRect().toJSON() as DOMRect;
    const rects = Object.entries(api.uiRects()).map(([id, r]) => {
      const a = api.canvasToPage(r.x, r.y), b = api.canvasToPage(r.x + r.width, r.y + r.height);
      return { id, left: a.x, right: b.x, top: a.y, bottom: b.y };
    });
    const scene = api.game.scene.getScene('game') as GameScene;
    const text = scene.children.list
      .filter(o => o.type === 'Text')
      .map(o => o as Phaser.GameObjects.Text)
      .filter(o => o.visible && ['Gate fallen', 'Last stand!'].includes(o.text))
      .map(o => {
        const { left, right, top, bottom } = o.getBounds();
        return { left, right, top, bottom };
      });
    const moments = scene['moments'];
    const boss = scene['hud']['bossBar'];
    const overlays = [moments['bannerText'], moments['bannerSub'], boss['name'], boss['hp']]
      .filter(label => label.visible)
      .map(label => {
        const { left, right, top, bottom } = label.getBounds();
        const a = api.canvasToPage(left, top), b = api.canvasToPage(right, bottom);
        return { id: label.text, left: a.x, right: b.x, top: a.y, bottom: b.y };
      });
    return { canvas, rects, text, overlays };
  });
  const overlaps = (a: Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>, b: typeof a) =>
    a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  for (const box of boxes.rects.filter(r => ['gate', 'repair'].includes(r.id))) {
    expect(box.left).toBeGreaterThanOrEqual(boxes.canvas.left - 0.5);
    expect(box.right).toBeLessThanOrEqual(boxes.canvas.right + 0.5);
    expect(box.top).toBeGreaterThanOrEqual(boxes.canvas.top - 0.5);
    expect(box.bottom).toBeLessThanOrEqual(boxes.canvas.bottom + 0.5);
    for (const other of [...boxes.rects.filter(r => r.id !== box.id), ...boxes.overlays]) {
      expect(overlaps(box, other), `${box.id} overlaps ${other.id}`).toBe(false);
    }
  }
  if (boxes.text.length === 2) expect(overlaps(boxes.text[0], boxes.text[1])).toBe(false);
  if (repair) {
    const r = await rectPageSize(page, 'repair');
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  }
}

export function siegeHudCases(heights: readonly (number | undefined)[]) {
  for (const height of heights) for (const metrics of ['normal', 'fixed Caslon', 'fixed fallback', 'wide']) {
    test(`Old Keep gate HUD fits at ${height ?? 'project size'} (${metrics})`, async ({ page }, info) => {
      test.setTimeout(60_000);
      if (height) await page.setViewportSize({ width: 390, height });
      if (metrics === 'wide') await useWideFontMetrics(page, process.platform === 'darwin' ? 1.09 : 1.06);
      if (metrics.startsWith('fixed')) await useTallFontMetrics(page, metrics === 'fixed fallback');
      await page.goto('/?keep=1&test=1');
      await page.waitForFunction(() => window.__tarpit?.keep?.() && !!window.__tarpit.uiRects().gate, null, { timeout: 40_000 });
      const repair = page.getByRole('button', { name: 'Repair 30', exact: true });
      await expect(repair).toBeDisabled();
      await page.evaluate(() => {
        const api = window.__tarpit!;
        api.state!().gate!.hp = 312;
        api.state!().gold = 29;
        api.step!(0);
      });
      await expect(repair).toBeDisabled();
      await page.evaluate(() => {
        const api = window.__tarpit!;
        api.state!().gold = 100;
        api.step!(0);
      });
      await expect(repair).toBeEnabled();
      await checkGateLabels(page, ['Gate 312 / 480'], true);
      const r = await rectPage(page, 'repair');
      if (info.project.name === 'chromium' && metrics === 'normal') {
        await repair.focus();
        await page.keyboard.press('Enter');
      } else if (info.project.name === 'chromium') await page.mouse.click(r.x, r.y);
      else await page.touchscreen.tap(r.x, r.y);
      const result = await page.evaluate(() => {
        const state = window.__tarpit!.state!();
        return [state.gate!.hp, state.gold, state.towers.length];
      });
      expect(result).toEqual([472, 70, 0]);
      await page.evaluate(() => {
        const api = window.__tarpit!;
        const state = api.state!();
        state.wave = 2;
        api.startWave!();
        state.enemies.push({ id: 50, type: 'grumblemaw', hp: 5600, distance: state.gate!.distance, slow: 0, slowTicksLeft: 0 });
        api.step!(1);
      });
      await expect(repair).toHaveCount(0);
      expect(await page.evaluate(() => window.__tarpit!.ui!().momentBanner)).toBe('Barricade unlocked');
      await checkGateLabels(page, ['Gate 466 / 480']);
      await page.evaluate(() => window.__tarpit!.step!(70));
      await checkGateLabels(page, ['Gate fallen', 'Last stand!']);
      await page.evaluate(() => window.__tarpit!.step!(360));
      await checkGateLabels(page, ['Gate fallen']);
      expect(await page.evaluate(() => {
        const scene = window.__tarpit!.game.scene.getScene('game');
        return scene.children.list.some(o => o.type === 'Text'
          && (o as Phaser.GameObjects.Text).visible && (o as Phaser.GameObjects.Text).text === 'Last stand!');
      })).toBe(false);
    });
  }
}
