import { expect, test } from '@playwright/test';

// Milestone 25c (B5): the test-only GameScene.spawnHorde works only with
// ?test=1 or ?perf=1. Without them the page keeps its read-only hooks
// (game, uiRects, canvasToPage, portraitCardVisible, animState, titleReady,
// and from milestone 31 fx and towerAngle;
// live.spec.ts),
// window.__tarpit has no spawnHorde, and calling the scene's method adds no
// enemy.
test('spawnHorde does nothing outside test and perf mode', async ({ page }) => {
  await page.goto('/?renderer=canvas');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  const r = await page.evaluate(async () => {
    const t = window.__tarpit!;
    const keys = Object.keys(t).sort();
    const title = t.game.scene.getScene('title') as unknown as { play(d?: string): void };
    title.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const scene = t.game.scene.getScene('game') as unknown as { spawnHorde(n: number): boolean; state: { enemies: unknown[] } };
    const before = scene.state.enemies.length;
    const ran = scene.spawnHorde(50);
    return { keys, ran, before, after: scene.state.enemies.length };
  });
  expect(r.keys).toEqual(['animState', 'canvasToPage', 'fx', 'game', 'portraitCardVisible', 'titleReady', 'towerAngle', 'uiRects']);
  expect(r).toMatchObject({ ran: false, before: 0, after: 0 });
});

test('spawnHorde works with ?perf=1 on the live loop', async ({ page }) => {
  await page.goto('/?renderer=canvas&perf=1');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  const r = await page.evaluate(async () => {
    const t = window.__tarpit!;
    const title = t.game.scene.getScene('title') as unknown as { play(d?: string): void };
    title.play();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const scene = t.game.scene.getScene('game') as unknown as { spawnHorde(n: number): boolean; state: { enemies: unknown[] } };
    return { ran: scene.spawnHorde(50), keys: Object.keys(t).length, alive: scene.state.enemies.length };
  });
  expect(r.ran).toBe(true);
  expect(r.keys).toBe(8);
  expect(r.alive).toBeGreaterThanOrEqual(50);
});
