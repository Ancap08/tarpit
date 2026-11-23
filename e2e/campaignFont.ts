import type { Page } from '@playwright/test';

/** Exercise Phaser's actual layout with a taller canvas font measurement. */
export async function useTallFontMetrics(page: Page, fallback = true) {
  if (fallback) await page.route('**/*.woff2', route => route.abort());
  await page.addInitScript(() => {
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const metrics = measure.call(this, text);
      const size = Number(/([\d.]+)px/.exec(this.font)![1]);
      Object.defineProperties(metrics, {
        actualBoundingBoxAscent: { value: size * 1.20 },
        actualBoundingBoxDescent: { value: size * 0.45 },
      });
      return metrics;
    };
  });
}
