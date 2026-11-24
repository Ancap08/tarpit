// PW_PORT=4373 node --experimental-strip-types scripts/art/m47Costs.ts [load|frames|mac]
// The phone project, production AUTO renderer, live loop and perf.spec.ts packed horde.
import assert from 'node:assert/strict';
import type { Browser } from '@playwright/test';
import type { GameScene } from '../../src/game/GameScene';
import type { TowerType } from '../../src/sim/types';
import { waitForTitle } from '../../e2e/title.ts';
import { landscape, origin, phone, press, run, start } from './m47Browser.ts';

async function frames(browser: Browser, rate: number, tier: number | null, desktop = false) {
  const context = await browser.newContext(desktop ? landscape : phone);
  try {
    const page = await context.newPage();
    await start(page, 'perf=1&look=' + (tier === null ? 'painted' : 'showpiece&showpieceTier=' + tier));
    const setup = await page.evaluate(() => {
      const api = window.__tarpit!, s = api.game.scene.getScene('game') as GameScene;
      s.state.gold = s.state.lives = 1e6;
      const types: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
      for (let row = 1; row < 15 && s.state.towers.length < 25; row += 2)
        for (let col = 1; col < 30 && s.state.towers.length < 25; col += 2)
          s.build({ row, col }, types[s.state.towers.length % types.length]);
      s.spawnHorde(120, 120);
      return { towers: s.state.towers.length, enemies: s.state.enemies.length, tier: api.showpiece?.()?.tier ?? null,
        renderer: api.game.renderer.type, layout: api.layout(), gpu: (() => {
          const gl = api.game.canvas.getContext('webgl') ?? api.game.canvas.getContext('webgl2');
          const info = gl?.getExtension('WEBGL_debug_renderer_info');
          return info ? gl!.getParameter(info.UNMASKED_RENDERER_WEBGL) as string : null;
        })() };
    });
    assert.equal(setup.towers, 25); assert.equal(setup.enemies, 120); assert.equal(setup.tier, tier);
    assert.equal(setup.layout, desktop ? 'landscape' : 'portrait');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const sample = await page.evaluate(() => new Promise<{
      fps: number; worstMs: number; p95Ms: number; ticks: number; frames: number; durationMs: number;
      start: unknown; end: unknown;
    }>(resolve => {
      const api = window.__tarpit!, s = api.game.scene.getScene('game') as GameScene;
      const deltas: number[] = [];
      const warmUntil = performance.now() + 1000;
      let last = 0, first = 0, tick = 0, begin: unknown;
      function frame(now: number) {
        const missing = 120 - s.state.enemies.length;
        if (missing > 0) s.spawnHorde(missing, 120);
        if (now >= warmUntil) {
          if (!first) { first = now; tick = s.state.tick; begin = api.showpiece?.(); }
          else deltas.push(now - last);
        }
        last = now;
        if (!first || now - first < 5000) return void requestAnimationFrame(frame);
        deltas.sort((a,b) => a-b);
        resolve({ fps: deltas.length * 1000 / (now-first), worstMs: deltas.at(-1)!, p95Ms: deltas[Math.floor(deltas.length*.95)],
          ticks: s.state.tick-tick, frames: deltas.length, durationMs: now-first, start: begin, end: api.showpiece?.() });
      }
      requestAnimationFrame(frame);
    }));
    assert.ok(sample.ticks > 0);
    console.log(JSON.stringify({ rate, tier, layout: setup.layout, renderer: setup.renderer === 2 ? 'WebGL' : 'Canvas', gpu: setup.gpu, ...sample }));
  } finally { await context.close(); }
}

// M43's CDP path. Each trial has an empty HTTP cache. Start at pointerdown and
// finish on Phaser's first postrender of the GameScene, in the browser clock.
async function load(browser: Browser, density: number, look: string) {
  const context = await browser.newContext({ ...landscape, deviceScaleFactor: density, serviceWorkers: 'block' });
  try {
    await context.addInitScript(() => Object.defineProperty(navigator, 'connection', {
      value: { effectiveType: '4g', downlink: 10 },
    }));
    const page = await context.newPage();
    await page.goto(origin + '/?look=' + look);
    await waitForTitle(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150,
      downloadThroughput: 200000, uploadThroughput: 93750 });
    await page.evaluate(() => {
      const game = window.__tarpit!.game;
      document.addEventListener('pointerdown', () => {
        performance.mark('m47-play');
        const check = () => {
          if (!game.scene.isActive('game')) return;
          performance.mark('m47-frame');
          game.events.off('postrender', check);
        };
        game.events.on('postrender', check);
      }, { once: true, capture: true });
    });
    await press(page, 'title:play');
    await page.waitForFunction(() => performance.getEntriesByName('m47-frame').length > 0);
    const reading = await page.evaluate(() => {
      const api = window.__tarpit!, scene = api.game.scene.getScene('game') as GameScene;
      const files = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
        .filter(r => /\/assets\/(painted|showpiece)\//.test(new URL(r.name).pathname))
        .map(r => ({ file: new URL(r.name).pathname.split('/').pop(), bytes: r.encodedBodySize }));
      return { ms: performance.measure('m47-load','m47-play','m47-frame').duration,
        density: scene.paintedState().density, showpiece: !!api.showpiece?.(), files };
    });
    assert.equal(reading.density, density); assert.equal(reading.showpiece, look === 'showpiece');
    console.log(JSON.stringify({ look, ...reading }));
  } finally { await context.close(); }
}

await run(async browser => {
  if (process.argv[2] === 'mac') {
    for (const tier of [null,0,1,2]) await frames(browser, 1, tier, true);
    return;
  }
  if (process.argv[2] !== 'load')
    for (const rate of [1,4,6]) for (const tier of [null,0,1,2]) await frames(browser, rate, tier);
  if (process.argv[2] !== 'frames')
    for (const density of [1,2]) for (const look of ['painted','showpiece']) await load(browser,density,look);
}, process.argv[2] === 'mac' ? { channel: 'chromium', args: ['--enable-gpu','--use-angle=metal'] } : {});
