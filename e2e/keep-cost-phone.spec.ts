import { expect, test } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';

for (const [label, visit] of [['Old Keep', '1'], ['Both Roads', '23&act3=1']]) {
  test(`low detail reduces the main-thread cost of the same ${label} phone battle`, { tag: '@keep-cost' }, async ({ page, context }) => {
    // Seven 80-frame samples plus transitions. Leave room for each frame to
    // take four times as long on a runner as it does on the measurement Mac.
    test.setTimeout(120_000);
    await page.goto(`/?keep=${visit}&perf=1&keepTier=2`);
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
      s.state.spawnedPerGroup = (s.state.level?.waves ?? s.state.fixedWaves)![0].groups.map(group => group.count);
      s.state.lives = 10_000;
      function refill() {
        const missing = 40 - s.state.enemies.length;
        if (missing > 0) s.spawnHorde(missing);
        requestAnimationFrame(refill);
      }
      requestAnimationFrame(refill);
    });

    const frames = (count: number) => page.evaluate(count => new Promise<void>(resolve => {
      let remaining = count;
      function frame() {
        if (--remaining === 0) resolve();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }), count);
    async function sample(tier: 0 | 2) {
      await page.evaluate(tier => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        const keep = s['keep']!;
        keep['quality'].tier = tier;
        // Begin each sample in the same dry interval, outside the opening
        // and before the next flash. The battle and sim continue normally.
        s['clock'].nowMs = 8_000;
        keep['previous'] = -Infinity;
      }, tier);
      await frames(16);
      const start = await busy();
      await frames(80);
      return (await busy() - start) * 1000 / 80;
    }

    // Discard the initial high-tier sample while the battle warms up.
    await sample(2);
    const samples: Record<0 | 2, number[]> = { 0: [], 2: [] };
    // Reverse the order in the middle pair to spread time-dependent effects.
    for (const order of [[2, 0], [0, 2], [2, 0]] as const) {
      for (const tier of order) {
        samples[tier].push(await sample(tier));
      }
    }
    const median = (tier: keyof typeof samples) => [...samples[tier]].sort((a, b) => a - b)[1];
    const measured = JSON.stringify(samples);
    console.log(`${label} at 4× CPU, main-thread ms/frame:`, measured);
    expect(median(0), measured).toBeLessThanOrEqual(median(2) * 0.90);
  });
}
