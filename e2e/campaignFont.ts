import type { Page } from '@playwright/test';
import { HUD_CASLON } from '../src/game/palette';

export const platformWideFactor = process.platform === 'darwin' ? 1.09 : 1.06;

/** Exercise Phaser's layout with tall text and 12% wider HUD digits and symbols. */
export async function useTallFontMetrics(page: Page, fallback = true) {
  if (fallback) await page.route('**/*.woff2', route => route.abort());
  await page.addInitScript((hudFamily) => {
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const metrics = measure.call(this, text);
      if (this.font.includes(hudFamily)) {
        const figures = text.match(/[\d\p{P}\p{S}]+/gu) ?? [];
        const advance = figures.reduce((sum, run) => sum + measure.call(this, run).width, 0);
        Object.defineProperty(metrics, 'width', { value: metrics.width + 0.12 * advance });
      }
      const size = Number(/([\d.]+)px/.exec(this.font)![1]);
      Object.defineProperties(metrics, {
        actualBoundingBoxAscent: { value: size * 1.20 },
        actualBoundingBoxDescent: { value: size * 0.45 },
      });
      return metrics;
    };
  }, HUD_CASLON);
}

/** Vary every measured advance while preserving the browser's other font metrics. */
export async function useWideFontMetrics(page: Page, factor = 1.06, family?: string) {
  await page.addInitScript(({ factor, family }) => {
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const metrics = measure.call(this, text);
      if (!family || this.font.includes(family)) Object.defineProperty(metrics, 'width', { value: metrics.width * factor });
      return metrics;
    };
  }, { factor, family });
}
