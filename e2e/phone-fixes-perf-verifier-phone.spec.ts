import { test } from '@playwright/test';
import { fingerFor, rectPage, startGame } from './phone';

const tStart = (c: import('@playwright/test').CDPSession, p: { x: number; y: number }) => c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
const tMove = (c: import('@playwright/test').CDPSession, p: { x: number; y: number }) => c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
const tEnd = (c: import('@playwright/test').CDPSession) => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

// Milestone 35 verifier: frames in 5 s of a continuous touch drag (prints; asserts nothing).
test('perf probe: frames in 5 s of a continuous drag', async ({ page }, info) => {
  await startGame(page);
  const client = await page.context().newCDPSession(page);
  for (const rate of [1, 6, 20]) {
    await client.send('Emulation.setCPUThrottlingRate', { rate });
    const from = await rectPage(page, 'bar:musketeer');
    const a = await fingerFor(page, { col: 4, row: 3 });
    const b = await fingerFor(page, { col: 24, row: 11 });
    await page.evaluate(() => {
      const w = window as unknown as { __f: number; __loop?: boolean };
      w.__f = 0;
      if (!w.__loop) {
        w.__loop = true;
        const loop = () => {
          w.__f++;
          requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
      }
    });
    await tStart(client, from);
    const t0 = Date.now();
    let i = 0;
    while (Date.now() - t0 < 5000) {
      const k = (Math.sin(i++ / 6) + 1) / 2;
      await tMove(client, { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
    const frames = await page.evaluate(() => (window as unknown as { __f: number }).__f);
    await tEnd(client);
    await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    console.log(`PERF ${info.project.name} cpu x${rate}: ${frames} rAF frames in 5s (${i} moves)`);
  }
});
