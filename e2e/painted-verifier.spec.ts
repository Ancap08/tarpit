import { expect, test, type Page } from '@playwright/test';
import type { GameScene } from '../src/game/GameScene';
import type { TitleScene } from '../src/game/TitleScene';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { api, rectPage, state } from './phone';
import { waitForGame, painted, paintedAsset, settle } from './painted';
import { waitForTitle } from './title';
import { hitAreaCase } from './paintedVerifier';

// Milestone 38 verifier (independent): the Look switch, loading, determinism,
// aim bearings, leaks. Real mode (no ?test=1) where the check is about what
// a player gets; test mode where the check needs the hooks.

const titleState = (page: Page) => page.evaluate(() => (window.__tarpit!.game.scene.getScene('title') as TitleScene).uiState());
const livePainted = (page: Page) => page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).paintedState());
const titleTexts = (page: Page) => page.evaluate(() =>
  window.__tarpit!.game.scene.getScene('title').children.list.flatMap((c) => 'text' in c ? [String((c as unknown as { text: string }).text)] : []));

async function clickRect(page: Page, name: string): Promise<void> {
  const { x, y } = await rectPage(page, name);
  await page.mouse.click(x, y);
}

function watch(page: Page) {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()} @ ${m.location().url}`);
  });
  return problems;
}

async function play(page: Page): Promise<void> {
  await clickRect(page, 'title:play');
  await waitForGame(page);
  await settle(page);
}

test('D1 fresh profile is Classic, plays a real wave with no painted request and writes nothing', async ({ page }) => {
  const problems = watch(page);
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/painted/') || /art-painted/.test(r.url())) requests.push(r.url()); });
  await page.goto('/?perf=1');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('classic');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBeNull();
  await play(page);
  expect((await livePainted(page)).active).toBe(false);
  await page.evaluate(() => (window.__tarpit!.game.scene.getScene('game') as GameScene).spawnHorde(5));
  await page.waitForTimeout(1500);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBeNull();
  expect(problems).toEqual([]);
});

for (const bad of ['', 'Painted', ' painted', 'painted ', 'PAINTED', '{"look":"painted"}', 'null', '1', 'classic\u0000painted']) {
  test(`D2 malformed stored value ${JSON.stringify(bad)} falls back to Classic silently`, async ({ page }) => {
    const problems = watch(page);
    await page.addInitScript((v) => localStorage.setItem('tarpit.look', v), bad);
    await page.goto('/');
    await waitForTitle(page);
    expect((await titleState(page)).look).toBe('classic');
    await play(page);
    expect((await livePainted(page)).active).toBe(false);
    expect(problems).toEqual([]);
  });
}

test('D2 throwing storage falls back to Classic silently, and a click still holds for the visit', async ({ page }) => {
  const problems = watch(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  await page.goto('/');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('classic');
  await clickRect(page, 'title:look:painted');
  expect((await titleState(page)).look).toBe('painted');
  await play(page);
  expect((await livePainted(page)).active).toBe(true);
  expect(problems).toEqual([]);
});

test('D3 URL values apply for one visit and do not change the stored choice', async ({ page }) => {
  await page.goto('/?look=painted');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('painted');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBeNull();
  await page.goto('/');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('classic');
  await clickRect(page, 'title:look:painted');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBe('painted');
  await page.goto('/?look=classic');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('classic');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBe('painted');
  await page.goto('/?look=bogus');
  await waitForTitle(page);
  expect((await titleState(page)).look).toBe('painted');
  // A click after a URL override stores that click, and the URL value stops mattering for this page.
  await page.goto('/?look=painted');
  await waitForTitle(page);
  await clickRect(page, 'title:look:classic');
  expect(await page.evaluate(() => localStorage.getItem('tarpit.look'))).toBe('classic');
  expect((await titleState(page)).look).toBe('classic');
});

for (const map of ['switchback', 'riverbend'] as const) {
  test(`D4 Painted chosen with ${map} gives Classic and the title says so`, async ({ page }) => {
    const problems = watch(page);
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/assets/painted/')) requests.push(r.url()); });
    await page.goto('/?look=painted');
    await waitForTitle(page);
    await clickRect(page, `title:map:${map}`);
    const texts = await titleTexts(page);
    expect(texts.some((t) => /Meadow only/i.test(t)), texts.join(' | ')).toBe(true);
    await play(page);
    expect((await livePainted(page)).active).toBe(false);
    expect(requests).toEqual([]);
    expect(problems).toEqual([]);
  });
}

test('D5 Painted at device pixel ratio 1 requests exactly one density (1x), every sheet once', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/painted/')) requests.push(new URL(r.url()).pathname); });
  await page.goto('/?look=painted');
  await waitForTitle(page);
  await play(page);
  const s = await livePainted(page);
  expect(s).toMatchObject({ active: true, density: 1 });
  expect(requests.filter((u) => u.includes('-2x-'))).toEqual([]);
  expect(new Set(requests).size).toBe(requests.length);
  expect(requests.length).toBe(54);
});

test('D5 a large window at device pixel ratio 1 (canvas scale 1.7) asks for 2x only', async ({ page }) => {
  await page.setViewportSize({ width: 1632, height: 986 });
  const requests: string[] = [];
  page.on('request', (r) => { if (r.url().includes('/assets/painted/')) requests.push(new URL(r.url()).pathname); });
  await page.goto('/?look=painted');
  await waitForTitle(page);
  await play(page);
  expect(await livePainted(page)).toMatchObject({ active: true, density: 2 });
  expect(requests.filter((u) => u.includes('-1x-'))).toEqual([]);
  expect(requests.length).toBe(54);
});

test.describe('device pixel ratio 2', () => {
  test.use({ deviceScaleFactor: 2 });
  test('D5 Painted asks for 2x only', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => { if (r.url().includes('/assets/painted/')) requests.push(new URL(r.url()).pathname); });
    await page.goto('/?look=painted');
    await waitForTitle(page);
    await play(page);
    expect(await livePainted(page)).toMatchObject({ active: true, density: 2 });
    expect(requests.filter((u) => u.includes('-1x-'))).toEqual([]);
    expect(requests.length).toBe(54);
    const filters = await page.evaluate(() => {
      const t = window.__tarpit!.game.textures;
      return t.getTextureKeys().filter((k) => k.startsWith('painted:')).map((k) => t.get(k).source[0].scaleMode);
    });
    expect(new Set(filters)).toEqual(new Set([0]));
  });
});

test.describe('painted file failures (service worker blocked so page.route sees the fetches)', () => {
  test.use({ serviceWorkers: 'block' });
  for (const failing of ['troll-1x.json', 'meadow-1x.png', 'flame-1x.png', 'cave-1x.json']) {
    test(`D6 ${failing} aborted: Classic starts, no game console error, a later visit paints`, async ({ page }) => {
      const problems = watch(page);
      const [name, ext] = failing.split('.');
      let blocked = true;
      await page.route(paintedAsset, (route) => {
        const url = route.request().url();
        if (blocked && url.includes(`/${name}-`) && url.endsWith(`.${ext}`)) return route.abort();
        return route.continue();
      });
      await page.goto('/?look=painted');
      await waitForTitle(page);
      await play(page);
      expect((await livePainted(page)).active).toBe(false);
      expect(await page.evaluate(() => window.__tarpit!.game.textures.getTextureKeys().filter((k) => k.startsWith('painted:')))).toEqual([]);
      expect(problems.filter((p) => !/Failed to load resource/.test(p))).toEqual([]);
      blocked = false;
      await page.goto('/?look=painted');
      await waitForTitle(page);
      await play(page);
      expect((await livePainted(page)).active).toBe(true);
    });
  }

  test('D6 a corrupt sheet (wrong JSON) falls back to Classic quietly', async ({ page }) => {
    const problems = watch(page);
    await page.route('**/assets/painted/goblin-1x-*.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"frameSize":[1,1]}' }));
    await page.goto('/?look=painted');
    await waitForTitle(page);
    await play(page);
    expect((await livePainted(page)).active).toBe(false);
    expect(problems).toEqual([]);
  });

  test('D6 a hung sheet (never answers) starts Classic after the 12 s limit, and Play shows progress meanwhile', async ({ page }) => {
    test.setTimeout(60_000);
    await page.route('**/assets/painted/troll-1x-*.png', () => undefined);
    await page.goto('/?look=painted');
    await waitForTitle(page);
    const t0 = Date.now();
    await clickRect(page, 'title:play');
    await page.waitForFunction(() => (window.__tarpit!.game.scene.getScene('title') as TitleScene).uiState().loading !== null);
    await page.waitForTimeout(2000);
    const loadingLabel = await titleTexts(page);
    console.log('D6 hung: title texts while loading:', JSON.stringify(loadingLabel.filter((t) => /Load|Play/.test(t))));
    await waitForGame(page);
    console.log(`D6 hung: Classic after ${Date.now() - t0} ms`);
    expect((await livePainted(page)).active).toBe(false);
  });
});

test('D7 service worker leaves painted files out of the precache; one Painted game lets an offline reload play Painted', async ({ page, context }) => {
  await page.goto('/');
  await waitForTitle(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const before = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(before.length).toBeGreaterThan(5);
  expect(before.filter((p) => p.includes('/assets/painted/'))).toEqual([]);
  await clickRect(page, 'title:look:painted');
  await play(page);
  expect((await livePainted(page)).active).toBe(true);
  const after = await page.evaluate(async () => {
    const out: string[] = [];
    for (const name of await caches.keys()) for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
    return out;
  });
  expect(after.filter((p) => p.includes('/assets/painted/')).length).toBe(54);
  await context.setOffline(true);
  await page.reload();
  await waitForTitle(page);
  await play(page);
  expect((await livePainted(page)).active).toBe(true);
  // Classic offline still works too.
  await page.reload();
  await waitForTitle(page);
  await clickRect(page, 'title:look:classic');
  await play(page);
  expect((await livePainted(page)).active).toBe(false);
});

test('E1 the simulation is identical in Classic and Painted for a scripted Meadow wave (test mode, fixed ticks)', async ({ browser }) => {
  const run = async (look: 'classic' | 'painted') => {
    const page = await browser.newPage({ viewport: { width: 960, height: 580 } });
    await page.goto(`/?test=1&look=${look}`);
    await waitForTitle(page);
    await api(page, (a) => a.startGame());
    expect((await painted(page)).active).toBe(look === 'painted');
    const snaps: string[] = [];
    await api(page, (a) => {
      a.state().gold = 2000;
      a.buildAt(7, 5, 'musketeer');
      a.buildAt(15, 9, 'cannon');
      a.buildAt(18, 9, 'tarpit');
      a.buildAt(10, 3, 'longbow');
      a.buildAt(12, 12, 'mortar');
      a.buildAt(5, 8, 'firepot');
      a.upgradeAt(7, 5, 'a' as never);
      a.startWave();
    });
    for (const ticks of [60, 240, 600, 1200, 1800]) {
      snaps.push(JSON.stringify(await page.evaluate((n) => { const a = window.__tarpit as unknown as TarpitTestApi; a.step(n); return { s: a.state(), e: a.events().length }; }, ticks)));
    }
    await page.close();
    return snaps;
  };
  const c = await run('classic');
  const p = await run('painted');
  expect(p).toEqual(c);
});

// F: bearings. Test mode: towers on a grid of Meadow cells; one enemy is walked along the path a step at a
// time. After each tick the tower that fired must show the frame pointing at its target on screen.
for (const portrait of [false, true]) {
  test(`F1 a firing tower shows the frame that points at its target on screen (${portrait ? 'portrait' : 'landscape'})`, async ({ page }) => {
    if (portrait) await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?test=1&look=painted');
    await waitForTitle(page);
    await api(page, (a) => a.startGame());
    expect(await api(page, (a) => a.layout())).toBe(portrait ? 'portrait' : 'landscape');
    const res = await page.evaluate((isPortrait) => {
      const a = window.__tarpit as unknown as TarpitTestApi;
      a.state().gold = 1e6;
      const cells: [number, number][] = [[4, 3], [10, 6], [14, 6], [17, 10], [9, 12], [22, 5], [26, 10], [13, 2], [3, 9], [20, 13], [24, 2], [7, 14]];
      const types = ['longbow', 'musketeer', 'cannon', 'mortar', 'firepot', 'tarpit'] as const;
      const built = cells.filter(([c, r], i) => a.buildAt(c, r, types[i % 6]).ok);
      a.spawnHorde(1, 1);
      const seen = new Set<number>();
      const rows: { want: number; frame: number; dist: number; tower: string }[] = [];
      for (let d = 10; d < 1550; d += 20) {
        const e0 = a.state().enemies[0];
        if (!e0) break;
        e0.hp = 1e9; e0.distance = d; e0.slow = 0;
        for (let t = 0; t < 25; t++) {
          a.step(1);
          const st = a.state();
          const ps = a.painted();
          for (const sh of st.shots) {
            const cx = sh.cell.col * 32 + 16, cy = sh.cell.row * 32 + 16;
            const [wx, wy] = [sh.to.x - cx, sh.to.y - cy];
            const [sx, sy] = isPortrait ? [-wy, wx] : [wx, wy];
            const want = ((Math.round(Math.atan2(sx, -sy) / (Math.PI / 8)) % 16) + 16) % 16;
            const [px, py] = isPortrait ? [480 - cy, 76 + cx] : [cx, cy];
            const spr = ps.sprites.find((s) => s.visible && Math.abs(s.x - px) < 0.5 && Math.abs(s.y - py) < 0.5 && !s.key.includes('goblin') && !s.key.includes('meadow'));
            if (!spr) { rows.push({ want, frame: -1, dist: 0, tower: sh.tower }); continue; }
            rows.push({ want, frame: spr.frame, dist: Math.hypot(wx, wy), tower: sh.tower });
            seen.add(want);
          }
        }
      }
      return { built: built.length, rows, wants: [...seen].sort((x, y) => x - y) };
    }, portrait);
    const off = res.rows.filter((r) => Math.min((r.frame - r.want + 16) % 16, (r.want - r.frame + 16) % 16) > 0);
    console.log(`F1 ${portrait ? 'portrait' : 'landscape'}: towers ${res.built}, shots ${res.rows.length}, bearings covered ${res.wants.join(',')}, mismatches ${off.length} ${JSON.stringify(off.slice(0, 5))}`);
    expect(res.rows.length).toBeGreaterThan(30);
    expect(res.wants.length).toBeGreaterThanOrEqual(10);
    expect(off).toEqual([]);
  });
}

test('F2 no object or texture leak after 5 Play agains, 3 Menu trips and Classic -> Painted -> Classic', async ({ page }) => {
  await page.goto('/?test=1&look=painted');
  await waitForTitle(page);
  await api(page, (a) => a.startGame());
  const counts = () => page.evaluate(() => {
    const g = window.__tarpit!.game;
    const gs = g.scene.getScene('game');
    return {
      textures: g.textures.getTextureKeys().length,
      gameChildren: gs.children.list.length,
      tweens: gs.tweens.getTweens().length,
      timers: (gs.time as unknown as { _active: unknown[] })._active.length,
      cams: gs.cameras.cameras.length,
      inputs: gs.input.manager ? (gs.input as unknown as { list: unknown[] }).list?.length ?? 0 : 0,
      keys: g.scene.getScenes(false).length,
    };
  });
  const lose = async () => {
    await api(page, (a) => { a.startWave(); a.step(6000); });
    expect(await api(page, (a) => a.endScreen())).toBe('lost');
  };
  await lose();
  await clickRect(page, 'playAgain');
  await expect.poll(() => state(page).then((s) => s.phase)).toBe('setup');
  const keys = () => page.evaluate(() => window.__tarpit!.game.textures.getTextureKeys());
  const base = await counts();
  const baseKeys = await keys();
  for (let i = 0; i < 5; i++) {
    await lose();
    await clickRect(page, 'playAgain');
    await expect.poll(() => state(page).then((s) => s.phase)).toBe('setup');
  }
  const afterAgain = await counts();
  for (let i = 0; i < 3; i++) {
    await lose();
    await clickRect(page, 'menu');
    await waitForTitle(page);
    await play(page);
  }
  const afterMenu = await counts();
  // Classic -> Painted -> Classic through the title.
  await lose();
  await clickRect(page, 'menu');
  await waitForTitle(page);
  await clickRect(page, 'title:look:classic');
  await play(page);
  expect((await livePainted(page)).active).toBe(false);
  const afterClassic1 = await counts();
  await lose();
  await clickRect(page, 'menu');
  await waitForTitle(page);
  await clickRect(page, 'title:look:painted');
  await play(page);
  expect((await livePainted(page)).active).toBe(true);
  await lose();
  await clickRect(page, 'menu');
  await waitForTitle(page);
  await clickRect(page, 'title:look:classic');
  await play(page);
  await lose();
  await clickRect(page, 'menu');
  await waitForTitle(page);
  await play(page);
  const end = await counts();
  const endKeys = await keys();
  console.log('F2 counts', JSON.stringify({ base, afterAgain, afterMenu, end }));
  expect(afterAgain.gameChildren).toBeLessThanOrEqual(base.gameChildren);
  expect(afterAgain.textures).toBe(base.textures);
  expect(afterMenu.textures).toBe(base.textures);
  expect(afterMenu.gameChildren).toBeLessThanOrEqual(base.gameChildren + 2);
  expect(afterAgain.tweens).toBeLessThanOrEqual(base.tweens + 2);
  console.log('F2 extra keys at end', JSON.stringify(endKeys.filter((k) => !baseKeys.includes(k))));
  // A first Classic game bakes 17 decor textures once; a second Classic round must add none.
  expect(end.textures).toBe(afterClassic1.textures);
  expect(end.gameChildren).toBeLessThanOrEqual(afterClassic1.gameChildren);
});

test('E hit areas: a tap on the painted body above the cell and on the cell act as in Classic', async ({ page }) => {
  const mouse = (x: number, y: number) => page.mouse.click(x, y);
  const c = await hitAreaCase(page, 'classic', mouse);
  const p = await hitAreaCase(page, 'painted', mouse);
  console.log('E hit areas', JSON.stringify({ c, p }));
  expect(p).toEqual(c);
  expect((c.cell as { open: boolean }).open).toBe(true);
});
