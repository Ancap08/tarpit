import { expect, test, type Page } from '@playwright/test';
import { waitForTitle } from './title';

// Non-test mode: the real game loop runs on real time. The page loads with
// ?renderer=canvas so the frame rate, and so the tick rate, does not depend
// on GPU availability (headless Chromium without a GPU renders WebGL in
// software at about 4 fps). The WebGL check is in renderer.spec.ts. window.__tarpit holds
// `game` and the read-only uiRects(), canvasToPage(), layout(), cellToPage(), worldToPage(), animState() and titleReady() here, so the clicks go where the HUD
// buttons are drawn (canvas == page at the 960x580 test viewport).

type LiveState = { tick: number; enemies: unknown[]; phase: string };
type Rect = { x: number; y: number; width: number; height: number };

async function clickButton(page: Page, name: 'startWave' | 'speed'): Promise<void> {
  const r = await page.evaluate((n) => window.__tarpit?.uiRects()[n] as Rect | undefined, name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
}

/** The title menu's [Play] (milestone 25: only Play starts the game). */
async function clickTitlePlay(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  expect(r, "uiRects()['title:play']").toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
}

test('live loop ticks, spawns enemies, and 2x runs faster', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/?renderer=canvas');
  await waitForTitle(page);
  // Phaser.CANVAS is 1.
  expect(await page.evaluate(() => window.__tarpit?.game.renderer.type)).toBe(1);
  await clickTitlePlay(page);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

  // Tick, enemy count and phase, with the page's clock so rates use the real
  // elapsed time between reads.
  const read = () =>
    page.evaluate(() => {
      const s = (window.__tarpit?.game.scene.getScene('game') as unknown as { state: LiveState }).state;
      return { tick: s.tick, enemies: s.enemies.length, phase: s.phase, at: performance.now() };
    });

  expect(await read()).toMatchObject({ phase: 'setup' });
  // Live pages expose the pause and mute controls alongside the inspection hooks.
  expect(await page.evaluate(() => Object.keys(window.__tarpit ?? {}).sort())).toEqual([
    'animState',
    // Milestone 33: the sound engine's state, the mute setting and offline rendering.
    'audio',
    'audioLab',
    'canvasToPage',
    // Milestone 31: the effects' read-only counts and a tower's drawn barrel angle.
    // Milestone 32b: cellToPage, layout (it replaced portraitCardVisible) and worldToPage.
    'cellToPage',
    // Milestone 34: the map decoration's state.
    'decor',
    'fx',
    'game',
    'layout',
    'pageLock',
    'pause',
    'paused',
    'resume',
    'setMuted',
    'titleReady',
    'towerAngle',
    'uiRects',
    'worldToPage',
  ]);
  await clickButton(page, 'startWave');
  const t0 = await read();
  expect(t0.phase).toBe('wave');
  await page.waitForTimeout(1500);
  const t1 = await read();

  await clickButton(page, 'speed');
  const a = await read();
  await page.waitForTimeout(1000);
  const b = await read();

  const base = t1.tick - t0.tick; // ticks gained in the 1.5 s 1x window
  const fast = b.tick - a.tick; // ticks gained in the 1 s 2x window
  const rate1x = (base / (t1.at - t0.at)) * 1000;
  const rate2x = (fast / (b.at - a.at)) * 1000;
  test.info().annotations.push({
    type: 'ticks',
    description: `1x: ${base} in ${Math.round(t1.at - t0.at)} ms (${rate1x.toFixed(1)}/s); ` +
      `2x: ${fast} in ${Math.round(b.at - a.at)} ms (${rate2x.toFixed(1)}/s); enemies ${t1.enemies}`,
  });
  console.log(`[live ticks] ${test.info().annotations.at(-1)!.description}`);

  // Floors, not exact counts: real-time timing is noisy. 60 ticks/s is
  // nominal. The 1x floor only proves the loop runs: in Phaser's warm-up (the
  // first 120 frames, see src/game/loop.ts) 1x runs one tick per frame, so a
  // 30 fps runner sits at about 45; 20 leaves room for a slower one.
  expect(base).toBeGreaterThanOrEqual(20);
  expect(t1.enemies).toBeGreaterThanOrEqual(1);
  expect(rate2x).toBeGreaterThanOrEqual(1.5 * rate1x);
});
