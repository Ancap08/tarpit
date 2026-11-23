import type { Page } from '@playwright/test';

/** Phaser registers a scene's buttons on its first rendered frame. */
export async function waitForFirstScreen(page: Page, { showTips = false } = {}): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:freePlay']);
  if (!showTips) await page.evaluate(() => window.__tarpit?.setTipsEnabled?.(false));
}

/** Reach the map and difficulty picker that existing Free play specs exercise. */
export async function waitForTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.titleReady?.());
  const point = await page.evaluate(() => {
    const api = window.__tarpit!;
    const rect = api.uiRects()['title:freePlay'];
    return rect ? api.canvasToPage(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
  });
  if (point) await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() && !!window.__tarpit.uiRects()['title:play']);
}
