import type { Page } from '@playwright/test';

/** Exercise Phaser's actual layout with a taller canvas font measurement. */
export async function useTallFontMetrics(page: Page) {
  await page.addInitScript(() => {
    const measure = CanvasRenderingContext2D.prototype.measureText;
    CanvasRenderingContext2D.prototype.measureText = function (text) {
      const metrics = measure.call(this, text);
      Object.defineProperties(metrics, {
        actualBoundingBoxAscent: { value: metrics.actualBoundingBoxAscent * 1.5 },
        actualBoundingBoxDescent: { value: metrics.actualBoundingBoxDescent * 1.5 },
      });
      return metrics;
    };
  });
}
