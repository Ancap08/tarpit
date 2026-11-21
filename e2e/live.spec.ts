import { expect, test } from '@playwright/test';

// Non-test mode: the real game loop runs on real time. window.__tarpit holds
// only `game` here (no uiRects), so button positions come from the HUD layout
// in src/game/hud.ts: Start Wave is x 726..864, speed is x 876..946, both
// y 492..528 (canvas == page at the 960x540 test viewport).
const START_WAVE = { x: 795, y: 510 };
const SPEED = { x: 911, y: 510 };

type LiveState = { tick: number; enemies: unknown[]; phase: string };

test('live loop ticks, spawns enemies, and 2x runs faster', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  await page.mouse.click(480, 270);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

  const read = () =>
    page.evaluate(() => {
      const s = (window.__tarpit?.game.scene.getScene('game') as unknown as { state: LiveState }).state;
      return { tick: s.tick, enemies: s.enemies.length, phase: s.phase };
    });

  expect(await read()).toMatchObject({ phase: 'setup' });
  await page.mouse.click(START_WAVE.x, START_WAVE.y);
  const t0 = await read();
  expect(t0.phase).toBe('wave');
  await page.waitForTimeout(1500);
  const t1 = await read();
  expect(t1.tick).toBeGreaterThan(60);
  expect(t1.enemies).toBeGreaterThanOrEqual(1);

  await page.mouse.click(SPEED.x, SPEED.y);
  const a = await read();
  await page.waitForTimeout(1000);
  const b = await read();
  const base = t1.tick - t0.tick; // ticks gained in the 1.5 s 1x window
  const base1s = base / 1.5;
  const fast = b.tick - a.tick;
  // Soft ratio check: real-time timing is noisy, so only a generous bound.
  expect(fast).toBeGreaterThanOrEqual(1.5 * base1s);
});
