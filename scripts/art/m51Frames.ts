// PW_PORT=4373 node --experimental-strip-types scripts/art/m51Frames.ts
import assert from 'node:assert/strict';
import type { GameScene } from '../../src/game/GameScene';
import { origin, phone, run } from './m47Browser.ts';

const cpuRate = Number(process.env.M51_CPU ?? 1);
assert.ok(Number.isFinite(cpuRate) && cpuRate >= 1);
await run(async browser => {
  for (const tier of [2, 1, 0]) {
    const context = await browser.newContext(phone);
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(30_000);
      await page.goto(origin + '/?perf=1&keep=1&keepTier=' + tier);
      await page.waitForFunction(() => window.__tarpit?.keep?.());
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
      await cdp.send('Performance.enable');
      await page.evaluate(() => {
        const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
        for (const [site, type] of [[4, 'musketeer'], [3, 'longbow'], [5, 'cannon'], [8, 'tarpit']] as const) {
          if (!s.build(s.state.map.buildSites![site], type).ok) throw Error('Benchmark tower placement refused');
        }
        if (!s.spawnHorde(40)) throw Error('Horde refused');
        // Replenish casualties and exits. Suppress the ordinary generator
        // so its scheduled arrivals cannot inflate the sample.
        s.state.spawnedPerGroup = s.state.fixedWaves![0].groups.map(group => group.count);
        s.state.lives = 10_000;
        function refill() {
          const missing = 40 - s.state.enemies.length;
          if (missing > 0) s.spawnHorde(missing);
          requestAnimationFrame(refill);
        }
        requestAnimationFrame(refill);
      });
      const warmupMs = 1_600;
      await new Promise(resolve => setTimeout(resolve, warmupMs));
      const metrics = async () => Object.fromEntries(
        (await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]),
      );
      const before = await metrics();
      const result = await page.evaluate(async () => {
        const api = window.__tarpit!;
        const s = api.game.scene.getScene('game') as GameScene;
        const gl = api.game.canvas.getContext('webgl') ?? api.game.canvas.getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const gpu = info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : 'unknown';
        const samples: number[] = [];
        let last = 0, first = 0;
        const tick = s.state.tick;
        await new Promise<void>(done => {
          function frame(now: number) {
            if (last) samples.push(now - last);
            else first = now;
            last = now;
            if (now - first >= 5_000) done();
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        samples.sort((a, b) => a - b);
        return {
          gpu, tier: s.keepState()?.tier, enemies: s.state.enemies.length, towers: s.state.towers.length, ticks: s.state.tick - tick,
          frames: samples.length, meanMs: (last - first) / samples.length, medianMs: samples[Math.floor(samples.length / 2)],
          p95Ms: samples[Math.floor(samples.length * .95)], worstMs: samples.at(-1),
        };
      });
      const after = await metrics();
      const elapsed = after.Timestamp - before.Timestamp;
      assert.equal(result.tier, tier);
      assert.equal(result.enemies, 40);
      assert.equal(result.towers, 4);
      assert.ok(result.ticks > 0);
      console.log(JSON.stringify({
        cpuRate, ...result,
        busyPercent: 100 * (after.TaskDuration - before.TaskDuration) / elapsed,
        scriptPercent: 100 * (after.ScriptDuration - before.ScriptDuration) / elapsed,
      }));
    } finally { await context.close(); }
  }
});
