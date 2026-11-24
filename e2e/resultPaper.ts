import type { Page } from '@playwright/test';
import { THEME } from '../src/game/ui/theme';

/** Measure the printed paper on the canvas at the clear margin below the buttons. */
export function resultPaper(page: Page) {
  return page.evaluate(async colour => {
    const { game, uiRects } = window.__tarpit!;
    await new Promise<void>(resolve => game.events.once('postrender', resolve));
    const ctx = game.canvas.getContext('2d')!;
    const { width, height } = game.canvas;
    const { data } = ctx.getImageData(0, 0, width, height);
    const paper = (x: number, y: number) => {
      if (x < 0 || x >= width || y < 0 || y >= height) return false;
      const i = (y * width + x) * 4;
      return ((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]) === colour;
    };
    const button = uiRects().playAgain;
    const base = Math.ceil(button.y + button.height) + 5;
    let left = Math.floor(width / 2), right = left;
    if (!paper(left, base)) throw new Error('No result paper below the button row');
    while (paper(left - 1, base)) left--;
    while (paper(right + 1, base)) right++;
    let top = base, bottom = base;
    while (paper(left + 3, top - 1)) top--;
    while (paper(left + 3, bottom + 1)) bottom++;
    return { x: left, y: top, width: right + 1 - left, height: bottom + 1 - top };
  }, THEME.paper);
}
