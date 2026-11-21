import { expect, test, type Page } from '@playwright/test';

// Non-test mode: the real game loop runs on real time. window.__tarpit holds
// `game` and the read-only uiRects(), canvasToPage(), portraitCardVisible() and animState() here, so the clicks go where the HUD
// buttons are drawn (canvas == page at the 960x580 test viewport).

type LiveState = { tick: number; enemies: unknown[]; phase: string };
type Rect = { x: number; y: number; width: number; height: number };

async function clickButton(page: Page, name: 'startWave' | 'speed'): Promise<void> {
  const r = await page.evaluate((n) => window.__tarpit?.uiRects()[n] as Rect | undefined, name);
  expect(r, `uiRects()['${name}']`).toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
}

test('live loop ticks, spawns enemies, and 2x runs faster', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  await page.mouse.click(480, 290);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

  const read = () =>
    page.evaluate(() => {
      const s = (window.__tarpit?.game.scene.getScene('game') as unknown as { state: LiveState }).state;
      return { tick: s.tick, enemies: s.enemies.length, phase: s.phase };
    });

  expect(await read()).toMatchObject({ phase: 'setup' });
  // Test mode is off, so only the read-only hooks are there besides `game`.
  expect(await page.evaluate(() => Object.keys(window.__tarpit ?? {}).sort())).toEqual([
    'animState',
    'canvasToPage',
    'game',
    'portraitCardVisible',
    'uiRects',
  ]);
  await clickButton(page, 'startWave');
  const t0 = await read();
  expect(t0.phase).toBe('wave');
  await page.waitForTimeout(1500);
  const t1 = await read();
  expect(t1.tick).toBeGreaterThan(60);
  expect(t1.enemies).toBeGreaterThanOrEqual(1);

  await clickButton(page, 'speed');
  const a = await read();
  await page.waitForTimeout(1000);
  const b = await read();
  const base = t1.tick - t0.tick; // ticks gained in the 1.5 s 1x window
  const base1s = base / 1.5;
  const fast = b.tick - a.tick;
  // Soft ratio check: real-time timing is noisy, so only a generous bound.
  expect(fast).toBeGreaterThanOrEqual(1.5 * base1s);
});

// Milestone 16: play renders with WebGL (Phaser.AUTO; Canvas only where WebGL
// is unavailable) and the walk animation runs on real time.
test('live play uses WebGL when available and the walk cycle advances', async ({ page }) => {
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

  await page.mouse.click(480, 290);
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
});
