import type { Page } from '@playwright/test';

/**
 * Wait until the title menu is showing and drawn, so its buttons take clicks
 * (milestone 26 follow-up). A title scene that is merely active is not
 * enough: on a first visit its create() runs between frames when the enemy
 * sheets finish loading, and Phaser hit-tests a new button only from the
 * scene's next update, so a click in that gap is lost (src/game/TitleScene.ts
 * "Ready"). Every spec that clicks or taps a title button waits with this.
 */
export async function waitForTitle(page: Page): Promise<void> {
  await page.waitForFunction(() => window.__tarpit?.titleReady?.() === true);
}
