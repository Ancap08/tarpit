import { expect, test, type Page } from '@playwright/test';
import { waitForTitle } from './title';

// Milestone 25c performance floor (docs/SCOPE-v4.md 25c): 120 enemies and 25
// towers on the live loop (real time, not test mode) must keep the median
// frame time under 33 ms, a 30 fps floor that CI's software path can hold.
// A floor, not a benchmark: it prints the median, the 95th percentile and
// the renderer. Loads /?renderer=canvas like live.spec.ts so the result does
// not depend on a GPU; PERF_WEBGL=1 drops that flag to measure WebGL
// locally. ?perf=1 enables the test-only GameScene.spawnHorde on the live
// loop. The horde is topped up to 120 on every frame as towers kill it,
// lives are raised so the game is not lost, and the sim must run at least
// 270 ticks in the 5 s (a stall fails). Milestone 26 dropped the old "at
// least 100 alive" check: it sampled right after the top-up to 120, so it
// could not fail; the tick floor and the frame-time limit are the checks. Two cases: spread along the whole path, and packed into the first
// 120 px (2 s of Goblin walk), the pile-up the horde waves make.

type Rect = { x: number; y: number; width: number; height: number };

const URL = process.env.PERF_WEBGL ? '/?perf=1' : '/?renderer=canvas&perf=1';
const ENEMIES = 120;
const TOWERS = 25;
const SECONDS = 5;
const FLOOR_MS = 33;
const MIN_TICKS = 270;

async function clickTitlePlay(page: Page): Promise<void> {
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  expect(r, "uiRects()['title:play']").toBeTruthy();
  // Through canvasToPage (milestone 32b): the phone project's canvas is fitted and letterboxed.
  const p = await page.evaluate(([x, y]) => window.__tarpit!.canvasToPage(x, y), [r!.x + r!.width / 2, r!.y + r!.height / 2]);
  await page.mouse.click(p.x, p.y);
}

for (const [name, span] of [
  ['spread along the path', undefined],
  ['packed into the first 120 px', 120],
] as const) {
  test(`120 enemies (${name}) and 25 towers keep the median frame under 33 ms`, async ({ page }, testInfo) => {
    // Milestone 32b: the phone project (portrait) runs the packed case only.
    test.skip(testInfo.project.name === 'phone' && span === undefined, 'the phone project runs the packed case only');
    test.setTimeout(60_000);
    await page.goto(URL);
    await waitForTitle(page);
    await clickTitlePlay(page);
    await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));

    const setup = await page.evaluate(
      ({ towers, enemies, span }) => {
        type Scene = {
          state: { gold: number; lives: number; enemies: unknown[]; towers: unknown[] };
          build(cell: { col: number; row: number }, type: string): { ok: boolean };
          spawnHorde(n: number, span?: number): boolean;
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
        const spawned = scene.spawnHorde(enemies, span ?? undefined);
        return { built, spawned, enemies: scene.state.enemies.length, renderer: window.__tarpit!.game.renderer.type };
      },
      { towers: TOWERS, enemies: ENEMIES, span: span ?? null },
    );
    expect(setup.built).toBe(TOWERS);
    expect(setup.spawned).toBe(true);
    expect(setup.enemies).toBe(ENEMIES);

    const frames = await page.evaluate(
      ({ seconds, enemies, span }) =>
        new Promise<{ deltas: number[]; ticks: number }>((resolve) => {
          type Scene = { state: { enemies: unknown[]; tick: number }; spawnHorde(n: number, span?: number): boolean };
          const scene = window.__tarpit!.game.scene.getScene('game') as unknown as Scene;
          const deltas: number[] = [];
          let last = performance.now();
          const end = last + seconds * 1000;
          const tick0 = scene.state.tick;
          const frame = (now: number) => {
            deltas.push(now - last);
            last = now;
            // Top the horde up on every frame.
            if (scene.state.enemies.length < enemies) scene.spawnHorde(enemies - scene.state.enemies.length, span ?? undefined);
            if (now < end) requestAnimationFrame(frame);
            else resolve({ deltas, ticks: scene.state.tick - tick0 });
          };
          requestAnimationFrame(frame);
        }),
      { seconds: SECONDS, enemies: ENEMIES, span: span ?? null },
    );

    const sorted = [...frames.deltas.slice(1)].sort((a, b) => a - b);
    const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
    const median = at(0.5);
    const p95 = at(0.95);
    const renderer = setup.renderer === 2 ? 'WebGL' : setup.renderer === 1 ? 'Canvas' : `type ${setup.renderer}`;
    console.log(
      `perf (${name}): renderer ${renderer}, ${sorted.length} frames in ${SECONDS} s, median ${median.toFixed(1)} ms, ` +
        `p95 ${p95.toFixed(1)} ms, ${frames.ticks} ticks`,
    );
    // The sim kept running at close to 1x (60 ticks per second).
    expect(frames.ticks).toBeGreaterThanOrEqual(MIN_TICKS);
    expect(median, `median frame time (renderer ${renderer})`).toBeLessThan(FLOOR_MS);
  });
}
