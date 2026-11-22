import { expect, test, type Page } from '@playwright/test';

// Milestone 25c performance floor (docs/SCOPE-v4.md 25c): 120 enemies and 25
// towers on the live loop (non-test mode, real time) must keep the median
// frame time under 33 ms, a 30 fps floor that CI's software path can hold.
// A floor, not a benchmark: it prints the median, the 95th percentile and
// the renderer. Loads /?renderer=canvas like live.spec.ts so the result does
// not depend on a GPU; PERF_WEBGL=1 drops the flag to measure WebGL locally.
// The horde is topped up to 120 as towers kill it, and lives are raised so
// the game is not lost during the run.

type Rect = { x: number; y: number; width: number; height: number };

const URL = process.env.PERF_WEBGL ? '/' : '/?renderer=canvas';
const ENEMIES = 120;
const TOWERS = 25;
const SECONDS = 5;
const FLOOR_MS = 33;

async function clickTitlePlay(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  expect(r, "uiRects()['title:play']").toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
}

test('120 enemies and 25 towers keep the median frame under 33 ms', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto(URL);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('title'));
  await clickTitlePlay(page);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

  const setup = await page.evaluate(
    ({ towers, enemies }) => {
      type Scene = {
        state: { gold: number; lives: number; enemies: unknown[]; towers: unknown[] };
        build(cell: { col: number; row: number }, type: string): { ok: boolean };
        spawnHorde(n: number): void;
      };
      const scene = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
      scene.state.gold = 1e6;
      scene.state.lives = 1e6;
      const types = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
      let built = 0;
      // Every second cell of every second row, so the towers spread over the map.
      for (let row = 1; row < 15 && built < towers; row += 2) {
        for (let col = 1; col < 30 && built < towers; col += 2) {
          if (scene.build({ col, row }, types[built % types.length]).ok) built += 1;
        }
      }
      scene.spawnHorde(enemies);
      return { built, enemies: scene.state.enemies.length, renderer: window.__tarpit!.game.renderer.type };
    },
    { towers: TOWERS, enemies: ENEMIES },
  );
  expect(setup.built).toBe(TOWERS);
  expect(setup.enemies).toBe(ENEMIES);

  const frames = await page.evaluate(
    ({ seconds, enemies }) =>
      new Promise<{ deltas: number[]; minEnemies: number; ticks: number }>((resolve) => {
        type Scene = { state: { enemies: unknown[]; tick: number }; spawnHorde(n: number): void };
        const scene = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
        const deltas: number[] = [];
        let last = performance.now();
        const end = last + seconds * 1000;
        const tick0 = scene.state.tick;
        let minEnemies = Infinity;
        let n = 0;
        const frame = (now: number) => {
          deltas.push(now - last);
          last = now;
          minEnemies = Math.min(minEnemies, scene.state.enemies.length);
          // Top the horde up every 15 frames.
          if (++n % 15 === 0 && scene.state.enemies.length < enemies) scene.spawnHorde(enemies - scene.state.enemies.length);
          if (now < end) requestAnimationFrame(frame);
          else resolve({ deltas, minEnemies, ticks: scene.state.tick - tick0 });
        };
        requestAnimationFrame(frame);
      }),
    { seconds: SECONDS, enemies: ENEMIES },
  );

  const sorted = [...frames.deltas.slice(1)].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const median = at(0.5);
  const p95 = at(0.95);
  const renderer = setup.renderer === 2 ? 'WebGL' : setup.renderer === 1 ? 'Canvas' : `type ${setup.renderer}`;
  console.log(
    `perf: renderer ${renderer}, ${sorted.length} frames in ${SECONDS} s, median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, ` +
      `${frames.ticks} ticks, at least ${frames.minEnemies} enemies on the field`,
  );
  // The game kept running (1x is 60 ticks per second; a slow runner may tick less).
  expect(frames.ticks).toBeGreaterThan(0);
  expect(frames.minEnemies).toBeGreaterThanOrEqual(ENEMIES / 2);
  expect(median, `median frame time (renderer ${renderer})`).toBeLessThan(FLOOR_MS);
});
