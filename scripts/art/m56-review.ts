// PW_PORT=4373 node --experimental-strip-types scripts/art/m56-review.ts SCRATCH <baseline|review|perf|perf-paired|download|lifecycle>
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, type Browser, type Page } from '@playwright/test';
import { waitForFirstScreen, waitForTitle } from '../../e2e/title.ts';
import type { SiegeView } from '../../src/game/keep/siegeView.ts';
import type { GameScene } from '../../src/game/GameScene.ts';
import type { TowerType } from '../../src/sim/types.ts';
import { origin as previewOrigin, phone, press, run } from './m47Browser.ts';

const scratch = resolve(process.argv[2]);
const mode = process.argv[3];
assert.equal(process.env.PW_PORT, '4373');
const reuse = process.argv.includes('--reuse-preview');
const origin = reuse ? 'http://localhost:4373' : previewOrigin;

async function enter(page: Page, level: number, query: string) {
  const keep = level >= 21;
  if (level && !keep) {
    await page.addInitScript(() => {
      const wins = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 1, 3]));
      localStorage.setItem('tarpit.campaign', JSON.stringify({ v: 2, stars: wins }));
      localStorage.setItem('tarpit.seenBroadsides', '["opening","secondAct","ending"]');
    });
  }
  await page.goto(origin + '/?' + query + (keep ? '&act3=1&keep=' + level : ''));
  if (!level) {
    await waitForTitle(page);
    await press(page, 'title:play', true);
  } else if (!keep) {
    await waitForFirstScreen(page);
    await press(page, 'title:campaign', true);
    await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelMap' && window.__tarpit.titleReady());
    if (level <= 10 && !await page.evaluate(id => !!window.__tarpit!.uiRects()['title:stop:' + id], level)) {
      const key = await page.evaluate(() => window.__tarpit!.uiRects()['title:act:1'] ? 'title:act:1' : 'title:act');
      await press(page, key, true);
    }
    await press(page, 'title:stop:' + level, true);
    await page.waitForFunction(() => window.__tarpit?.screen?.() === 'levelCard' && window.__tarpit.titleReady());
    await press(page, 'title:play', true);
  }
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game') && !!window.__tarpit.uiRects().startWave);
}

async function fixture(page: Page) {
  return page.evaluate(() => {
    const api = window.__tarpit!;
    const scene = api.game.scene.getScene('game') as GameScene;
    const state = api.state!();
    assertActive();
    function assertActive() {
      if (!api.painted!().active && !location.search.includes('look=classic')) throw new Error('Painted fell back');
    }
    if (state.level?.id === 11) {
      state.gold = 1000;
      for (const [col, row, kind, path] of [[7, 10, 'musketeer', 'A'], [11, 7, 'cannon', 'B'],
        [14, 1, 'longbow'], [22, 8, 'firepot'], [25, 10, 'mortar']] as const) {
        if (!api.buildAt!(col, row, kind).ok) throw new Error('Could not build ' + kind);
        if (path && (!api.upgradeAt!(col, row).ok || !api.upgradeAt!(col, row, path).ok)) throw new Error('Could not upgrade ' + kind);
      }
      state.wave = 2;
      api.startWave!();
      state.waveTick = 3950;
      for (let id = 0; id < 24; id++) {
        const distance = 390 + 28 * id;
        const type = id % 5 === 3 ? 'harpy' : 'shieldbearer';
        state.enemies.push({ id, type, hp: id % 4 === 0 ? 44 : 70, maxHp: 70, slow: 0, slowTicksLeft: 0, distance });
      }
      state.gold = 186;
      state.lives = 17;
    } else if (state.gate && state.level) {
      state.gold = 1e6;
      const build = state.map.buildSites ?? [];
      for (const tower of state.level.allowedTowers) {
        if (!build.some(site => api.buildAt!(site.col, site.row, tower).ok)) throw new Error('Could not build ' + tower);
      }
      state.wave = state.level.waves.length - 1;
      api.startWave!();
      const types = [...new Set(state.level.waves.flatMap(w => w.groups.map(g => g.type)))];
      if (state.level.endingBoss === 'grumblemaw' && !types.includes('wolf')) types.push('wolf');
      const roads = [{ id: state.map.mainRoad, path: state.map.path },
        ...(state.map.otherRoads ?? []).map(road => ({ id: road.id,
          path: [...road.approach, ...state.map.path.slice(road.joinIndex)] }))];
      for (let id = 0; id < 18; id++) {
        const type = types[id % types.length];
        if (id >= types.length && (type === 'ram' || type === 'grumblemaw')) continue;
        const road = roads[id % roads.length];
        if (!road) throw new Error('Missing road');
        // The gate lies on the shared road, one yard length before the end.
        const length = road.path.slice(1).reduce((sum, b, i) => {
          const a = road.path[i];
          return sum + Math.hypot(b.x - a.x, b.y - a.y);
        }, 0);
        const gap = type === 'ram' ? 9 : type === 'grumblemaw' ? 71 : 4 + id * 4;
        state.enemies.push({ id, type, road: road.id, hp: 980, slow: 0, slowTicksLeft: 0,
          distance: length - state.gate.yardLength - gap });
      }
      if (!scene.useSpecialAt('guards', state.gate.x, state.gate.y).ok) throw new Error('Could not place the squad');
      // Keep the simulated tick frozen and settle the real battle camera.
      const view = (scene as unknown as { siegeView: SiegeView }).siegeView;
      Object.defineProperty(view, 'frozen', { value: false });
      view.update('wave', 0);
      view.update('wave', 1500);
    } else {
      const first = state.level?.allowedTowers[0] ?? 'musketeer';
      state.gold = 1e6;
      for (let c = 0; c < 15; c++) {
        if (api.buildAt!(c, 3, first).ok) break;
      }
      api.startWave!();
      api.step!(420);
    }
    state.nextEnemyId = Math.max(0, ...state.enemies.map(e => e.id)) + 1;
    api.step!(0);
    const a = api.cellToPage(7, 10), b = api.cellToPage(11, 7);
    const enemy = api.animState(9);
    const at = enemy && scene.displayedMapPoint(enemy);
    const crowd = at ? api.canvasToPage(at.x, at.y) : api.worldToPage(420, 260);
    const gate = state.gate ? api.worldToPage(state.gate.x, state.gate.y) : null;
    return { a, b, crowd, gate, towers: state.towers.length, enemies: state.enemies.length };
  });
}

async function retained(page: Page) {
  return page.evaluate(() => {
    const game = window.__tarpit!.game;
    const seen = new Set<object>();
    const groups: Record<string, number> = {};
    const keys = Object.keys(game.textures.list).sort();
    function sum(group: string, source: HTMLImageElement | HTMLCanvasElement) {
      if (seen.has(source)) return;
      seen.add(source);
      const width = 'naturalWidth' in source ? source.naturalWidth : source.width;
      const height = 'naturalHeight' in source ? source.naturalHeight : source.height;
      groups[group] = (groups[group] ?? 0) + width * height * 4;
    }
    for (const [key, texture] of Object.entries(game.textures.list)) {
      const label = key.startsWith('painted:sharp:') ? 'sharp' : key.startsWith('painted:') ? 'painted'
        : key.startsWith('keep:') ? 'keepTextures' : key.startsWith('siege:') ? 'siege'
          : key.startsWith('showpiece:') ? 'showpiece' : 'otherTextures';
      for (const source of texture.source) sum(label, source.image as HTMLCanvasElement | HTMLImageElement);
    }
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>('#game [aria-hidden=true] canvas')) sum('keepCanvases', canvas);
    const css = game.canvas.getBoundingClientRect();
    return { keys, groups, total: Object.values(groups).reduce((a, b) => a + b, 0),
      canvas: [game.canvas.width, game.canvas.height], css: [css.width, css.height],
      gameUnits: [game.scale.width, game.scale.height], dpr: devicePixelRatio };
  });
}

const namedTexture = (key: string) => !/^[a-f0-9]{8}(?:-[a-f0-9]+){4}$/.test(key);
const digest = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

async function inspect(browser: Browser, level: number, height: number, look: string, ui: boolean, capture: boolean) {
  const context = await browser.newContext({ ...phone, viewport: { width: 390, height } });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('request', req => {
      const url = new URL(req.url());
      if (url.protocol === 'http:' && url.origin === origin) {
        requests.push(url.pathname.replace(/-[\w-]{8}\.(js|webp|woff2|png)$/, '.$1'));
      }
    });
    await enter(page, level, `test=1&look=${look}${ui ? '&ui=new' : ''}`);
    const setup = await retained(page);
    const setupPixels = capture ? digest(await page.screenshot({ scale: 'device' })) : '';
    const positions = await fixture(page);
    const roster = await retained(page);
    const state = await page.evaluate(() => JSON.stringify(window.__tarpit!.state!()));
    assert.deepEqual(errors, []);
    if (ui && look !== 'classic') {
      assert.ok(roster.keys.some(key => key.startsWith('painted:sharp:')));
      assert.ok(!requests.some(path => /shared-[12]x\.webp/.test(path)), requests.join('\n'));
      assert.ok(roster.total <= (level >= 21 ? 70_000_000 : 60_000_000), JSON.stringify(roster.groups));
    }
    let wavePixels = '';
    if (capture) {
      const name = `${level}-${height}-${look}-${ui ? 'on' : 'off'}`;
      const pixels = await page.screenshot({ scale: 'device', path: join(scratch, name + '.png') });
      wavePixels = digest(pixels);
      await writeFile(join(scratch, name + '.json'), JSON.stringify(positions));
    }
    const comparisons = { setupPixels, wavePixels, state: digest(state), requests: requests.sort(), keys: roster.keys.filter(namedTexture) };
    console.log(JSON.stringify({ level, height, look, ui, setup: setup.total, roster: roster.total,
      groups: roster.groups, canvas: roster.canvas, css: roster.css, gameUnits: roster.gameUnits, positions }));
    return comparisons;
  } finally { await context.close(); }
}

async function audit(browser: Browser) {
  const off = [
    [11, 656, 'painted', false], [11, 844, 'painted', false], [25, 844, 'painted', false],
    [1, 844, 'painted', false], [0, 844, 'painted', false], [0, 844, 'showpiece', false],
    [0, 844, 'classic', true], [0, 656, 'classic', false],
    [21, 844, 'painted', false], [22, 844, 'painted', false], [23, 844, 'painted', false],
    [24, 844, 'painted', false], [10, 844, 'painted', false], [20, 844, 'painted', false],
    [25, 656, 'painted', false],
  ] as const;
  const rows = [];
  for (const [level, height, look, ui] of off) rows.push(await inspect(browser, level, height, look, ui, true));
  const receipt = join(scratch, 'isolation.json');
  if (mode === 'baseline') await writeFile(receipt, JSON.stringify(rows));
  else {
    const baseline = JSON.parse(await readFile(receipt, 'utf8')) as typeof rows;
    for (const row of baseline) {
      row.keys = row.keys.filter(namedTexture);
      row.requests = row.requests.filter(url => url.startsWith('/'));
    }
    for (const [i, row] of rows.entries()) assert.deepEqual(row, baseline[i], JSON.stringify(off[i]));
    for (const [level, height, look] of [
      [11, 656, 'painted'], [11, 844, 'painted'], [25, 844, 'painted'], [25, 656, 'painted'],
      [1, 844, 'painted'], [0, 844, 'painted'], [0, 844, 'showpiece'],
      [10, 844, 'painted'], [20, 844, 'painted'], [21, 844, 'painted'],
      [22, 844, 'painted'], [23, 844, 'painted'], [24, 844, 'painted'],
    ] as const) await inspect(browser, level, height, look, true, level === 11 || level === 25);
    await verifyLifecycle(browser);
    console.log(`Isolation passed: ${2 * rows.length} pixel hashes, ${rows.length} state hashes, ${rows.length} texture and request inventories.`);
  }
}

async function verifyLifecycle(browser: Browser) {
  const context = await browser.newContext(phone);
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await enter(page, 1, 'test=1&look=painted&ui=new');
    const early = await retained(page);
    assert.ok(early.keys.includes('painted:sharp:cannon-icon'));
    assert.ok(!early.keys.includes('painted:sharp:cannon-2x'));
    assert.ok(!early.keys.includes('painted:sharp:grumblemaw-2x'));
    await page.evaluate(() => window.__tarpit!.cheatGold!());
    await page.waitForFunction(() => ['cannon', 'fire-pot', 'tar-pit', 'mortar', 'flame', 'tar-glob', 'mortar-shell']
      .every(name => window.__tarpit!.game.textures.exists(`painted:sharp:${name}-2x`)));
    await page.evaluate(() => {
      const api = window.__tarpit!;
      if (!api.buildAt!(7, 10, 'cannon').ok) throw new Error('Cheat did not open Cannon');
      if (!api.painted!().sprites.some(sprite => sprite.key === 'painted:sharp:cannon-2x')) throw new Error('Missing Cannon poses');
      api.pause();
    });
    await press(page, 'pause:restart', true);
    await press(page, 'pause:restart', true);
    await page.waitForFunction(() => window.__tarpit?.screen?.() === 'game' && !window.__tarpit.paused() &&
      window.__tarpit.state!().towers.length === 0);
    assert.ok((await retained(page)).keys.includes('painted:sharp:goblin-2x'));
    await page.evaluate(() => window.__tarpit!.pause());
    await press(page, 'pause:menu', true);
    await page.waitForFunction(() => window.__tarpit?.titleReady());
    assert.ok(!(await retained(page)).keys.some(key => key.startsWith('painted:')));
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
  console.log('Locked icon only, on-demand unlock, in-place restart and release on leaving passed.');
}

async function perf(browser: Browser) {
  for (const height of [844, 656]) {
    const paired = mode === 'perf-paired';
    const combinations = [
      { stock: true, ui: false }, { stock: false, ui: true },
      { stock: true, ui: true }, { stock: false, ui: false },
    ];
    const cases = paired ? [...combinations, ...combinations.slice().reverse(), ...combinations]
      : [false, true, true, false, false, true].map(ui => ({ stock: false, ui }));
    for (const { stock, ui } of cases) {
      const context = await browser.newContext({ ...phone, viewport: { width: 390, height } });
      try {
        if (stock) await context.route(origin + '/**', route => {
          const pathname = new URL(route.request().url()).pathname;
          return route.fulfill({ path: join(scratch, 'dist', pathname === '/' ? '/index.html' : pathname) });
        });
        const page = await context.newPage();
        await enter(page, 0, 'perf=1&look=painted' + (ui ? '&ui=new' : ''));
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
        await page.evaluate(() => {
          const game = window.__tarpit!.game;
          const scene = game.scene.getScene('game') as GameScene;
          if (!scene.paintedState().active) throw new Error('Painted fell back');
          scene.state.gold = scene.state.lives = 1e6;
          const types: TowerType[] = ['musketeer', 'cannon', 'tarpit', 'longbow', 'mortar', 'firepot'];
          let count = 0;
          for (let row = 1; row < 15 && count < 12; row += 2) {
            for (let col = 1; col < 30 && count < 12; col += 2) {
              if (scene.build({ row, col }, types[count % types.length]).ok) count++;
            }
          }
          if (count !== 12 || !scene.spawnHorde(40, 245)) throw new Error('Perf fixture incomplete');
          scene.state.spawnedPerGroup.fill(99_999);
          for (const enemy of scene.state.enemies) enemy.hp = enemy.maxHp = 1e6;
        });
        await cdp.send('Performance.enable');
        await delay(900);
        const metric = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration')!.value;
        const before = await metric();
        const result = await page.evaluate(() => new Promise<{
          frames: number; enemies: number; ticks: number; frameMedian: number; frameP95: number; renderer: string; canvas: number[];
        }>(resolve => {
          const game = window.__tarpit!.game;
          const scene = game.scene.getScene('game') as GameScene;
          const intervals: number[] = [];
          let last = performance.now();
          const tick0 = scene.state.tick;
          const frame = () => {
            const now = performance.now();
            intervals.push(now - last);
            last = now;
          };
          game.events.on('postrender', frame);
          setTimeout(() => {
            game.events.off('postrender', frame);
            const gl = (game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
            const info = gl?.getExtension('WEBGL_debug_renderer_info');
            const sorted = intervals.slice(1).sort((a, b) => a - b);
            resolve({ frames: intervals.length, enemies: scene.state.enemies.length, ticks: scene.state.tick - tick0,
              frameMedian: sorted[Math.floor(sorted.length * .5)], frameP95: sorted[Math.floor(sorted.length * .95)],
              renderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : gl ? 'WebGL' : 'Canvas',
              canvas: [game.canvas.width, game.canvas.height] });
          }, 3000);
        }));
        const elapsed = await metric() - before;
        assert.equal(result.enemies, 40);
        assert.ok(result.frames > 30);
        console.log(JSON.stringify({ build: stock ? 'stock' : 'sharp', height, ui, mainMsPerFrame: elapsed * 1000 / result.frames, ...result }));
      } finally { await context.close(); }
    }
  }
}

async function download(browser: Browser) {
  const sharp = new Set(await readdir('assets/art-painted/sharp'));
  for (const [look, ui, level] of [['painted', false, 0], ['painted', true, 0], ['showpiece', true, 0],
    ['painted', false, 25], ['painted', true, 25], ['painted', true, 1], ['painted', true, -1]] as const) {
    const context = await browser.newContext(phone);
    try {
      const page = await context.newPage();
      const urls = new Set<string>();
      page.on('request', req => {
        const url = new URL(req.url());
        if (url.protocol === 'http:' && url.origin === origin) urls.add(url.pathname);
      });
      if (level === -1) {
        await page.goto(origin + '/?ui=new');
        await waitForFirstScreen(page);
      } else if (level === 1) {
        await page.addInitScript(() => {
          localStorage.setItem('tarpit.seenBroadsides', '["opening"]');
          localStorage.setItem('tarpit.seenTips', '[1]');
        });
        await page.goto(origin + '/?look=painted&ui=new');
        await waitForFirstScreen(page);
        await press(page, 'title:campaign', true);
        await press(page, 'title:stop:1', true);
        await press(page, 'title:play', true);
        await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
      } else await enter(page, level, `look=${look}${ui ? '&ui=new' : ''}`);
      await page.evaluate(async () => { await navigator.serviceWorker.ready; });
      urls.add('/sw.js');
      const cached = await page.evaluate(async () => {
        const keys = (await caches.keys()).filter(key => key.startsWith('tarpit|/|'));
        return (await Promise.all(keys.map(async key => (await (await caches.open(key)).keys()).map(r => new URL(r.url).pathname)))).flat();
      });
      cached.forEach(url => urls.add(url));
      const files = await Promise.all([...urls].map(async path => [path, (await stat(join('dist', path === '/' ? '/index.html' : path))).size] as const));
      const sharpFiles = files.filter(([name]) => name.startsWith('/assets/painted/') &&
        sharp.has(basename(name).replace(/-[\w-]{8}(?=\.[^.]+$)/, '')));
      console.log(JSON.stringify({ look, ui, level, files: files.length,
        bytes: files.reduce((sum, [, n]) => sum + n, 0),
        sharpFiles: sharpFiles.length, sharpBytes: sharpFiles.reduce((sum, [, n]) => sum + n, 0) }));
      if (ui && level === 0 && look === 'painted') {
        await context.setOffline(true);
        await enter(page, 0, 'look=painted&ui=new');
        assert.ok((await retained(page)).keys.some(key => key.startsWith('painted:sharp:')));
        console.log('Warmed sharp Free play returned offline.');
      }
    } finally { await context.close(); }
  }
}

if (mode === 'baseline') process.chdir(scratch);
const measuring = mode === 'perf' || mode === 'perf-paired';
function work(browser: Browser) {
  if (measuring) return perf(browser);
  if (mode === 'download') return download(browser);
  if (mode === 'lifecycle') return verifyLifecycle(browser);
  return audit(browser);
}
if (reuse) {
  const browser = await chromium.launch();
  try { await work(browser); } finally { await browser.close(); }
} else {
  await run(work, measuring ? { args: ['--enable-gpu', '--use-angle=metal'] } : {});
}
