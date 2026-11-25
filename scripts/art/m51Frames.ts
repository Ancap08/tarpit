// PW_PORT=4373 node --experimental-strip-types scripts/art/m51Frames.ts
import assert from 'node:assert/strict';
import type { GameScene } from '../../src/game/GameScene';
import { origin, phone, run } from './m47Browser.ts';

await run(async browser => {
  for (const tier of [0, 1, 2]) {
    const context = await browser.newContext(phone);
    try {
      const page = await context.newPage();
      await page.goto(origin + '/?perf=1&keep=1&keepTier=' + tier);
      await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
      const result = await page.evaluate(async () => {
        const api = window.__tarpit!;
        const s = api.game.scene.getScene('game') as GameScene;
        const gl = api.game.canvas.getContext('webgl') ?? api.game.canvas.getContext('webgl2');
        const info = gl?.getExtension('WEBGL_debug_renderer_info');
        const gpu = info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : 'unknown';
        if (!s.spawnHorde(40)) throw Error('Horde refused');
        // The runner adds replacement goblins on the road. Suppress the ordinary
        // wave generator so its scheduled arrivals cannot inflate the sample.
        s.state.spawnedPerGroup.fill(1_000);
        s.state.lives = 10_000;
        const warm = performance.now() + 1_000;
        const samples: number[] = [];
        let last = 0, first = 0;
        const before = s.state.tick;
        await new Promise<void>(done => {
          function frame(now: number) {
            const missing = 40 - s.state.enemies.length;
            if (missing > 0) s.spawnHorde(missing);
            if (now >= warm) {
              if (first) samples.push(now - last);
              else first = now;
            }
            last = now;
            if (first && now - first >= 5_000) done();
            else requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        samples.sort((a,b) => a-b);
        return { gpu, tier:s.keepState()?.tier, enemies:s.state.enemies.length, ticks:s.state.tick-before,
          frames:samples.length, meanMs:(last-first)/samples.length, medianMs:samples[Math.floor(samples.length / 2)],
          p95Ms:samples[Math.floor(samples.length * .95)], worstMs:samples.at(-1) };
      });
      assert.equal(result.tier, tier);
      assert.equal(result.enemies, 40);
      assert.ok(result.ticks > 0);
      console.log(JSON.stringify(result));
    } finally { await context.close(); }
  }
});
