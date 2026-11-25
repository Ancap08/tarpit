// Verifier note (milestone 52a): alone this passes 10 of 10 (low/high ratio 0.70 to 0.77,
// limit 0.90). Inside a full phone-project run with parallel workers it failed 2 of 10 and
// the first sample or two ran 1.5x to 2x slow while the other workers were busy, so the
// low/high medians crossed. Run it serially after the other specs, or take more samples.
import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';

test('each Old Keep tier reduces the main-thread cost of the same phone battle', async ({ page, context }) => {
  // Six 80-frame samples plus transitions. Leave room for each frame to
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

  const samples: Record<0 | 2, number[]> = { 0: [], 2: [] };
  // Reverse the order in the middle pair to spread time-dependent effects.
  for (const order of [[2, 0], [0, 2], [2, 0]] as const) {
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
  const median = (tier: keyof typeof samples) => [...samples[tier]].sort((a, b) => a - b)[1];
  const measured = JSON.stringify(samples);
  console.log('Old Keep at 4× CPU, main-thread ms/frame:', measured);
  expect(median(0), measured).toBeLessThanOrEqual(median(2) * 0.90);
});
