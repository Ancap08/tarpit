import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { Detail } from '../src/game/showpiece/governor';

test('each Old Keep tier reduces the main-thread cost of the same phone battle', async ({ page, context }) => {
  // Nine 80-frame samples plus transitions. Leave room for each frame to
  // take four times as long on a runner as it does on the measurement Mac.
  test.setTimeout(120_000);
  await page.goto('/?keep=1&perf=1&keepTier=2');
  await page.waitForFunction(() => window.__tarpit?.keep?.());
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await cdp.send('Performance.enable');
  const busy = async () =>
    (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration')!.value;

  await page.evaluate(() => {
    const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
    for (const [site, type] of [[4, 'musketeer'], [3, 'longbow'], [5, 'cannon'], [8, 'tarpit']] as const) {
      if (!s.build(s.state.map.buildSites![site], type).ok) throw Error('Could not place performance fixture tower');
    }
    s.spawnHorde(40);
    s.state.spawnedPerGroup = s.state.fixedWaves![0].groups.map(group => group.count);
    s.state.lives = 10_000;
    function refill() {
      const missing = 40 - s.state.enemies.length;
      if (missing > 0) s.spawnHorde(missing);
      requestAnimationFrame(refill);
    }
    requestAnimationFrame(refill);
  });

  const samples: Record<Detail, number[]> = { 0: [], 1: [], 2: [] };
  // Rotate the order to spread browser warm-up and concurrent CI work.
  for (const order of [[2, 1, 0], [0, 2, 1], [1, 0, 2]] as const) {
    for (const tier of order) {
      await page.evaluate(tier => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        const keep = s['keep']!;
        keep['quality'].tier = tier;
        // Begin each sample in the same dry interval, outside the opening
        // and before the next flash. The battle and sim continue normally.
        s['clock'].nowMs = 8_000;
        keep['previous'] = -Infinity;
        return new Promise<void>(resolve => {
          let remaining = 16;
          function frame() {
            if (--remaining === 0) resolve();
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
      }, tier);
      const start = await busy();
      await page.evaluate(() => new Promise<void>(resolve => {
        let remaining = 80;
        function frame() {
          if (--remaining === 0) resolve();
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }));
      samples[tier].push((await busy() - start) * 1000 / 80);
    }
  }
  const median = (tier: Detail) => samples[tier].sort((a, b) => a - b)[1];
  expect(median(2), JSON.stringify(samples)).toBeGreaterThan(median(1) * 1.03);
  expect(median(1), JSON.stringify(samples)).toBeGreaterThan(median(0) * 1.03);
});
