import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, type Page } from '@playwright/test';
import { preview } from 'vite';
import { landscape, origin, phone, press } from './m47Browser.ts';
import type { GameScene } from '../../src/game/GameScene.ts';
import { waitForFirstScreen } from '../../e2e/title.ts';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const publicWins = Object.fromEntries(Array.from({ length: 19 }, (_, i) => [i + 1, i % 4]));
const mode = process.argv[2];

async function ready(page: Page, screen: string) {
  await page.waitForFunction(screen => window.__tarpit?.screen?.() === screen && window.__tarpit.titleReady(), screen);
}

async function isolation(build: string) {
  const rows: unknown[] = [];
  await visit(build, async browser => {
    for (const profile of [phone, landscape]) {
      for (const look of ['classic', 'painted', 'showpiece']) {
        for (const map of ['meadow', 'switchback', 'riverbend'] as const) {
          const context = await browser.newContext(profile);
          try {
            const page = await context.newPage();
            const requests: string[] = [];
            page.on('request', request => {
              const url = new URL(request.url());
              if (url.origin !== origin) return;
              if (url.protocol === 'blob:') requests.push('blob: image');
              else requests.push(url.pathname.replace(/-[\w-]{8}(?=\.(js|webp|woff2|png|json)$)/, '') + url.search);
            });
            await page.addInitScript(wins => {
              if (localStorage.getItem('tarpit.campaign') === null) {
                localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars: wins }));
                localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct"]');
              }
            }, publicWins);
            await page.goto(origin + '/?test=1&look=' + look + (look === 'classic' ? '&act3=0' : ''));
            await waitForFirstScreen(page, { showStory: true });
            const frame = async () => hash(await page.locator('canvas').screenshot({ scale: 'css' }));
            const frames = [await frame()];
            await press(page, 'title:campaign');
            await ready(page, 'levelMap');
            frames.push(await frame());
            await press(page, 'title:act');
            await ready(page, 'levelMap');
            assert.equal(await page.evaluate(() => window.__tarpit!.levelStops!()[0].id), 1);
            frames.push(await frame());
            await press(page, 'title:act');
            await ready(page, 'levelMap');
            await press(page, 'title:stop:20');
            await ready(page, 'levelCard');
            frames.push(await frame());
            await press(page, 'title:play');
            await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game');
            await page.evaluate(() => {
              const api = window.__tarpit!;
              const state = api.state!();
              state.wave = state.level!.waves.length;
              state.phase = 'won';
              api.step!(1);
            });
            await page.waitForFunction(() => window.__tarpit?.campaignResult?.()?.complete);
            frames.push(await frame());
            await press(page, 'menu');
            await ready(page, 'ending');
            frames.push(await frame());
            await press(page, 'title:continue');
            await ready(page, 'levelMap');
            await press(page, 'title:back');
            await ready(page, 'first');
            await page.evaluate(map => window.__tarpit!.startGame!('normal', map), map);
            frames.push(await frame());
            const setup = await page.evaluate(() => JSON.stringify(window.__tarpit!.state!()));
            await page.evaluate(() => {
              window.__tarpit!.startWave!();
              window.__tarpit!.step!(420);
            });
            frames.push(await frame());
            const state = await page.evaluate(() => ({
              battle: JSON.stringify(window.__tarpit!.state!()),
              progress: localStorage.getItem('tarpit.campaign'),
              broadsides: localStorage.getItem('tarpit.seenBroadsides'),
            }));
            rows.push({ viewport: profile.viewport, look, map, frames, setup, state, requests: requests.sort() });
          } finally { await context.close(); }
        }
      }
    }
  });
  return rows;
}

async function visit(build: string, work: (browser: Awaited<ReturnType<typeof chromium.launch>>) => Promise<void>) {
  const server = await preview({ logLevel: 'error', build: { outDir: build },
    preview: { host: '127.0.0.1', port: Number(process.env.PW_PORT), strictPort: true } });
  try {
    const browser = await chromium.launch();
    try { await work(browser); } finally { await browser.close(); }
  } finally { await server.close(); }
}

async function cost(build: string, candidate: boolean) {
  await visit(build, async browser => {
    const context = await browser.newContext(phone);
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await cdp.send('Performance.enable');
      const busy = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration')!.value;
      const frames = (count: number) => page.evaluate(count => new Promise<number[]>(resolve => {
        const intervals: number[] = [];
        let previous: number;
        function frame(now: number) {
          if (previous !== undefined) intervals.push(now - previous);
          previous = now;
          if (intervals.length === count) resolve(intervals);
          else requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
      }), count);
      for (const tier of [2, 0]) {
        await page.goto(origin + '/?keep=23&perf=1&keepTier=' + tier + (candidate ? '&act3=1' : ''));
        await page.waitForFunction(() => window.__tarpit?.keep?.());
        const gate = await page.evaluate(() => {
          const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
          for (const [site, type] of [[0, 'musketeer'], [3, 'longbow'], [8, 'cannon'], [9, 'tarpit']] as const) {
            if (!s.build(s.state.map.buildSites![site], type).ok) throw Error('Could not build fixture tower');
          }
          s.spawnHorde(40);
          s.state.spawnedPerGroup = s.state.level!.waves[0].groups.map(group => group.count);
          s.state.lives = 10_000;
          s.state.gate!.hp = 10_000_000;
          function refill() {
            const missing = 40 - s.state.enemies.length;
            if (missing > 0) s.spawnHorde(missing);
            requestAnimationFrame(refill);
          }
          requestAnimationFrame(refill);
          return s.boardLayout.toScreen(s.state.gate!);
        });
        const samples: number[] = [];
        const cadence: number[] = [];
        for (let i = 0; i < 3; i++) {
          await page.evaluate(() => {
            const s = window.__tarpit!.game.scene.getScene('game') as GameScene;
            s['clock'].nowMs = 8_000;
          });
          await frames(20);
          const start = await busy();
          const intervals = await frames(80);
          samples.push((await busy() - start) * 1000 / intervals.length);
          cadence.push(...intervals);
        }
        const sorted = [...cadence].sort((a, b) => a - b);
        console.log(JSON.stringify({ candidate, tier, gate, median: [...samples].sort((a, b) => a - b)[1], samples,
          frameP95Ms: sorted[Math.ceil(0.95 * sorted.length) - 1], framesOver25Ms: cadence.filter(ms => ms > 25).length }));
      }
    } finally { await context.close(); }
  });
}

const base = process.argv[3];
assert.ok(base, 'Pass a built baseline directory');
if (mode === 'cost') {
  await cost(base, false);
  if (process.argv.includes('--compare')) await cost('dist', true);
} else {
  const before = await isolation(base);
  const after = await isolation('dist');
  for (const [index, result] of after.entries()) assert.deepEqual(result, before[index], `Switch-off mismatch in scenario ${index + 1}`);
  console.log('144 switch-off canvas hashes, 36 sim states, 18 progress and story records, and 18 cold request inventories match.');
}
