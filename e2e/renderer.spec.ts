import { expect, test, type Page } from '@playwright/test';

// Milestone 16: play renders with WebGL (Phaser.AUTO; Canvas only where WebGL
// is unavailable) and the walk animation runs on real time. Nothing here is
// rate-based: on a machine without a GPU, WebGL runs in software at a few
// frames a second (the tick-rate checks are in live.spec.ts, on Canvas).

type LiveState = { tick: number };
type Rect = { x: number; y: number; width: number; height: number };

async function clickButton(page: Page, name: 'startWave'): Promise<void> {
  const r = await page.evaluate((n) => window.__tarpit?.uiRects()[n] as Rect | undefined, name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
}

test('live play uses WebGL when available, ticks, and the walk cycle advances', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  const info = await page.evaluate(() => ({
    renderer: window.__tarpit?.game.renderer.type,
    webgl: (() => {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl2') || c.getContext('webgl'));
    })(),
  }));
  // Phaser.CANVAS is 1, Phaser.WEBGL is 2.
  expect(info.renderer).toBe(info.webgl ? 2 : 1);

  // The title menu's [Play] (milestone 25: only Play starts the game).
  const play = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  expect(play, "uiRects()['title:play']").toBeTruthy();
  await page.mouse.click(play!.x + play!.width / 2, play!.y + play!.height / 2);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
  await clickButton(page, 'startWave');
  await page.waitForFunction(() => window.__tarpit?.animState(0) != null);
  const anim = await page.evaluate(() => window.__tarpit?.animState(0));
  expect(anim).toMatchObject({ texture: 'goblin', anim: 'goblin-walk-right', facing: 'right' });
  // Sample Goblin 0's walk frame over 500 ms: at 10 fps it must change.
  const frames = new Set<number>();
  for (let i = 0; i < 6; i++) {
    const f = await page.evaluate(() => window.__tarpit?.animState(0)?.frame);
    if (typeof f === 'number') frames.add(f);
    await page.waitForTimeout(100);
  }
  expect(frames.size).toBeGreaterThan(1);

  await page.waitForTimeout(1500);
  const tick = await page.evaluate(
    () => (window.__tarpit?.game.scene.getScene('game') as unknown as { state: LiveState }).state.tick,
  );
  expect(tick).toBeGreaterThan(0);
});
