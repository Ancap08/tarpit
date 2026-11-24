import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, appendFileSync } from 'node:fs';
import { createServer, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { TarpitTestApi } from '../src/game/testGlobal';
import { GRID_COLS, GRID_ROWS, isBuildableTerrain, MAPS } from '../src/sim';
import { swManifest } from '../scripts/sw-build';
import { cacheName } from '../src/sw/rules';
import { waitForTitle } from './title';

// Milestone 32a verifier probes (independent of install.spec.ts): update path
// with a real second build, bad deploys, install failure, hanging network,
// and pointer mapping with safe-area insets. Findings are in DEVLOG
// "Verifier notes". The two test.fixme cases (503 page, hanging page) were
// fixed in the 32a follow-up and now pass.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
type Override = { status?: number; hang?: boolean; body?: string; type?: string } | undefined;
interface Site {
  dir: string;
  override?: (path: string) => Override;
  hits: string[];
}

async function serve(site: Site, mount = '/'): Promise<{ origin: string; close: () => Promise<void> }> {
  const held: ServerResponse[] = [];
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    site.hits.push(path);
    const o = site.override?.(path);
    if (o?.hang) return void held.push(res);
    if (o) return void res.writeHead(o.status ?? 200, { 'content-type': o.type ?? 'text/html' }).end(o.body ?? '');
    if (!path.startsWith(mount)) return void res.writeHead(404).end();
    let rel = normalize(path.slice(mount.length));
    if (rel === '.' || rel === '' || rel.endsWith('/')) rel = join(rel, 'index.html');
    try {
      const body = readFileSync(join(site.dir, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/html' }).end('<h1>404</h1>');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((r) => {
        held.forEach((h) => h.destroy());
        server.closeAllConnections();
        server.close(() => r());
      }),
  };
}

let tmp = '';
let A = '';
let B = '';
let jsA = '';
let jsB = '';
const jsOf = (dir: string) => readdirSync(join(dir, 'assets')).find((f) => /^index-.*\.js$/.test(f))!;

test.beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), 'tarpit-verifier-'));
  A = join(tmp, 'a');
  B = join(tmp, 'b');
  cpSync(join(ROOT, 'dist'), A, { recursive: true });
  // Build B: a copy of the source with one changed source file, built for real.
  const src = join(tmp, 'src-b');
  for (const d of ['src', 'scripts', 'public', 'assets']) cpSync(join(ROOT, d), join(src, d), { recursive: true });
  for (const f of ['index.html', 'vite.config.ts', 'tsconfig.json', 'package.json']) cpSync(join(ROOT, f), join(src, f));
  symlinkSync(join(ROOT, 'node_modules'), join(src, 'node_modules'));
  appendFileSync(join(src, 'src/main.ts'), "\ndocument.documentElement.dataset.build = 'B';\n");
  execFileSync('npx', ['vite', 'build', '--outDir', B, '--emptyOutDir', '--logLevel', 'warn'], { cwd: src, stdio: 'pipe' });
  jsA = jsOf(A);
  jsB = jsOf(B);
});
test.afterAll(() => rmSync(tmp, { recursive: true, force: true }));

const cacheNames = (p: Page) => p.evaluate(() => caches.keys());
async function waitActive(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'))
    .toBe('activated');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}
const build = (p: Page) => p.evaluate(() => document.documentElement.dataset.build ?? 'A');
async function offline(context: BrowserContext, srv: { close: () => Promise<void> }) {
  await srv.close();
  await context.setOffline(true);
}

test.describe('update path with a real second build', () => {
  test('A to B online, B offline, A cache gone, two tabs, best scores survive', async ({ context }) => {
    expect(jsA).not.toBe(jsB);
    const site: Site = { dir: A, hits: [] };
    const srv = await serve(site);
    const tab1 = await context.newPage();
    await tab1.goto(`${srv.origin}/`);
    await tab1.evaluate(() => localStorage.setItem('tarpit.best', 'x'));
    await waitActive(tab1);
    const cacheA = cacheName(srv.origin, swManifest(A).version);
    expect(await cacheNames(tab1)).toEqual([cacheA]);
    expect(await build(tab1)).toBe('A');

    site.dir = B; // deploy B
    const tab2 = await context.newPage();
    await tab2.goto(`${srv.origin}/`);
    expect(await build(tab2)).toBe('B'); // next online open shows B
    const cacheB = cacheName(srv.origin, swManifest(B).version);
    expect(cacheB).not.toBe(cacheA);
    await expect.poll(() => cacheNames(tab2)).toEqual([cacheB]);

    // tab1 is still the A page, now under B's worker. What does an old hashed file give?
    const r = await tab1.evaluate(async (u) => fetch(u).then((x) => x.status).catch(() => 'error'), `/assets/${jsA}`);
    test.info().annotations.push({ type: 'old-hashed-online', description: String(r) });
    // In no worker cache: the worker passes it to the network, which answers from the browser's HTTP
    // cache (A's own bytes) or the server (404). Never another file.
    const body = await tab1.evaluate(async (u) => fetch(u).then(async (x) => (x.ok ? (await x.text()).length : x.status)), `/assets/${jsA}`);
    expect([readFileSync(join(A, 'assets', jsA), 'utf8').length, 404]).toContain(body);
    // The A page keeps running (its bundle is already loaded).
    expect(await tab1.evaluate(() => window.__tarpit?.game !== undefined)).toBe(true);

    await offline(context, srv);
    const rOff = await tab1.evaluate(async (u) => fetch(u).then((x) => x.status).catch(() => 'error'), `/assets/${jsA}`);
    test.info().annotations.push({ type: 'old-hashed-offline', description: String(rOff) });
    // Offline: A's own bytes (kept in the worker's cache from the online fetch above, or the HTTP
    // cache) or a network error at once. Never another file and never a hang.
    const bodyOff = await tab1.evaluate(async (u) => fetch(u).then(async (x) => (x.ok ? (await x.text()).length : x.status), () => 'error'), `/assets/${jsA}`);
    expect([readFileSync(join(A, 'assets', jsA), 'utf8').length, 'error']).toContain(bodyOff);
    await tab2.reload();
    expect(await build(tab2)).toBe('B');
    await waitForTitle(tab2);
    expect(await tab2.evaluate(() => localStorage.getItem('tarpit.best'))).toBe('x');
    await context.setOffline(false);
  });
});

test.describe('bad deploys', () => {
  for (const [name, o] of [
    ['404', { status: 404 }],
    ['html 200', { status: 200, body: '<html>oops</html>', type: 'text/html' }],
    ['500', { status: 500 }],
  ] as const) {
    test(`sw.js served as ${name} after install: page still works, worker stays`, async ({ page }) => {
      const site: Site = { dir: A, hits: [] };
      const srv = await serve(site);
      await page.goto(`${srv.origin}/`);
      await waitActive(page);
      site.override = (p) => (p.endsWith('/sw.js') ? o : undefined);
      await page.reload();
      await waitForTitle(page);
      const upd = await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update().then(() => 'ok', (e) => String(e))));
      await page.waitForTimeout(500);
      const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
      test.info().annotations.push({ type: `sw.js ${name}`, description: `update()=${upd}; registrations after=${regs}` });
      // Observed: a failed update leaves the old worker in place; the page keeps working.
      expect(upd).toContain('Failed to update');
      expect(regs).toBe(1);
      await srv.close();
    });
  }

  test('removing the worker from the deploy (no register code, sw.js 404): is the registration removed?', async ({ page }) => {
    const site: Site = { dir: A, hits: [] };
    const srv = await serve(site);
    await page.goto(`${srv.origin}/`);
    await waitActive(page);
    site.override = (p) => (p.endsWith('/sw.js') ? { status: 404 } : undefined);
    await page.reload();
    await page.waitForTimeout(1000);
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForTimeout(300);
    }
    const regs = await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
    test.info().annotations.push({ type: 'remove-by-404', description: `registrations after 4 reloads=${regs}` });
    // Observed: deleting sw.js from a deploy does not remove installed workers. The kill switch
    // (TARPIT_SW=off, follow-up) is tested in install.spec.ts.
    expect(regs).toBe(1);
    await srv.close();
  });

  // Found by the verifier (32a): a 5xx/404 page replaced the cached game. Fixed in the follow-up.
  test('origin answers 503 for the page while online: shows the cached game', async ({ page }) => {
    const site: Site = { dir: A, hits: [] };
    const srv = await serve(site);
    await page.goto(`${srv.origin}/`);
    await waitActive(page);
    site.override = (p) => (p === '/' ? { status: 503, body: '<h1>503</h1>' } : undefined);
    await page.reload();
    const shows503 = await page.evaluate(() => document.body.textContent?.includes('503') ?? false);
    test.info().annotations.push({ type: 'page-503', description: `page shows the 503 error instead of cached game: ${shows503}` });
    expect(shows503).toBe(false);
    await srv.close();
  });
});

test('install failure: one asset 500 on first install leaves no active worker and no half cache', async ({ page }) => {
  const site: Site = { dir: A, hits: [], override: (p) => (p.includes('goblin') ? { status: 500 } : undefined) };
  const srv = await serve(site);
  await page.goto(`${srv.origin}/`);
  await page.waitForTimeout(2000);
  const st = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    const names = await caches.keys();
    const counts: Record<string, number> = {};
    for (const n of names) counts[n] = (await (await caches.open(n)).keys()).length;
    return { active: r?.active?.state ?? null, installing: r?.installing?.state ?? null, waiting: r?.waiting?.state ?? null, counts };
  });
  test.info().annotations.push({ type: 'install-failure', description: JSON.stringify(st) });
  expect(st.active).toBeNull(); // no active worker
  expect(Object.values(st.counts).every((n) => n === 0)).toBe(true); // an empty cache at most, never half full
  await srv.close();
});

test('install failure while A is active: B fails, A keeps working offline', async ({ context }) => {
  const site: Site = { dir: A, hits: [] };
  const srv = await serve(site);
  const page = await context.newPage();
  await page.goto(`${srv.origin}/`);
  await waitActive(page);
  const [cacheA] = await cacheNames(page);
  site.dir = B;
  site.override = (p) => (p.includes('goblin') ? { status: 500 } : undefined);
  await page.reload();
  await page.waitForTimeout(2000);
  const names = await cacheNames(page);
  test.info().annotations.push({ type: 'B-install-fails', description: JSON.stringify({ names, cacheA, build: await build(page) }) });
  await offline(context, srv);
  await page.reload();
  await waitForTitle(page);
  expect(await build(page)).toBe('A'); // A's cache still serves offline; B retries on the next load
  await context.setOffline(false);
});

test.describe('requests', () => {
  test('query strings, deep path, no-store, range, ?test=1 under an installed worker', async ({ page }) => {
    const site: Site = { dir: A, hits: [] };
    const srv = await serve(site);
    await page.goto(`${srv.origin}/`);
    await waitActive(page);
    const out = await page.evaluate(async (js) => {
      const f = async (u: string, init?: RequestInit) => {
        const r = await fetch(u, init).catch(() => null);
        return r ? `${r.status} ${r.headers.get('content-length') ?? ''}` : 'error';
      };
      return {
        noStore: await f(`/assets/${js}`, { cache: 'no-store' }),
        range: await f(`/assets/${js}`, { headers: { range: 'bytes=0-9' } }),
        query: await f(`/assets/${js}?x=1`),
        deep: await f('/no/such/path'),
        manifest: await f('/manifest.webmanifest?x=1'),
      };
    }, jsA);
    test.info().annotations.push({ type: 'requests', description: JSON.stringify(out) });
    await page.goto(`${srv.origin}/?test=1`);
    await waitForTitle(page);
    expect(await page.evaluate(() => typeof window.__tarpit?.step)).toBe('function');
    await srv.close();
  });

  // Found by the verifier (32a): no timeout on the page fetch left a blank page. Fixed in the
  // follow-up: after PAGE_TIMEOUT_MS (3 s) the cached page shows.
  test('hanging network on a page load with a worker installed: how long until the cached game shows', async ({ page }) => {
    const site: Site = { dir: A, hits: [] };
    const srv = await serve(site);
    await page.goto(`${srv.origin}/`);
    await waitActive(page);
    site.override = (p) => (p === '/' ? { hang: true } : undefined);
    const t0 = Date.now();
    const nav = page.goto(`${srv.origin}/`, { timeout: 12000 }).then(() => 'loaded', () => 'still hanging at 12 s');
    const res = await nav;
    test.info().annotations.push({ type: 'hang', description: `${res} after ${Date.now() - t0} ms` });
    expect(res).toBe('loaded'); // wanted: a timeout then the cached copy
    await srv.close();
  });
});

test.describe('safe area input mapping', () => {
  const corners = [
    [0, 0],
    [GRID_COLS - 1, 0],
    [0, GRID_ROWS - 1],
    [GRID_COLS - 1, GRID_ROWS - 1],
  ];
  /** The buildable Meadow cell nearest a grid corner. */
  function nearestBuildable(cc: number, cr: number) {
    let best = { col: 0, row: 0 };
    let bd = 1e9;
    for (let col = 0; col < GRID_COLS; col++)
      for (let row = 0; row < GRID_ROWS; row++) {
        const d = (col - cc) ** 2 + (row - cr) ** 2;
        if (d < bd && isBuildableTerrain({ col, row }, MAPS.meadow)) {
          bd = d;
          best = { col, row };
        }
      }
    return best;
  }
  for (const insets of [
    { left: 47, right: 47, bottom: 21, top: 0 },
    { left: 0, right: 0, bottom: 34, top: 47 },
  ]) {
    for (const touch of [false, true]) {
      test(`towers land on the pointed cell at the four map corners, ${touch ? 'tap' : 'click'}, insets ${JSON.stringify(insets)}`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
        const page = await ctx.newPage();
        await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets });
        await page.goto('/?test=1');
        await waitForTitle(page);
        await page.evaluate(() => (window.__tarpit as TarpitTestApi).startGame());
        for (let i = 0; i < 3; i++) await page.evaluate(() => (window.__tarpit as TarpitTestApi).cheatGold());
        const box = await page.evaluate(() => document.querySelector('canvas')!.getBoundingClientRect().toJSON());
        expect(box.x).toBeGreaterThanOrEqual(insets.left);
        expect(box.y).toBeGreaterThanOrEqual(insets.top);
        // Independent of canvasToPage: map from the canvas element's own box (960 x 580 canvas space).
        const pt = (cx: number, cy: number) => ({ x: box.x + (cx * box.width) / 960, y: box.y + (cy * box.height) / 580 });
        const press = async (x: number, y: number) => (touch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
        const r = await page.evaluate(() => window.__tarpit!.uiRects()['bar:musketeer']);
        const b = pt(r.x + r.width / 2, r.y + r.height / 2);
        await press(b.x, b.y);
        const want: string[] = [];
        for (const [cc, cr] of corners) {
          const c = nearestBuildable(cc, cr);
          const p = pt(c.col * 32 + 16, c.row * 32 + 16);
          await press(p.x, p.y);
          if (touch) await press(p.x, p.y); // two-tap placement: arm, then build
          want.push(`${c.col},${c.row}`);
        }
        const got = (await page.evaluate(() => (window.__tarpit as TarpitTestApi).state())).towers.map((t) => `${t.cell.col},${t.cell.row}`).sort();
        expect(got).toEqual([...want].sort());
        await ctx.close();
      });
    }
  }
});


test('kill switch: the retiring worker reloads an open page exactly once, then nothing controls it', async ({ page }) => {
  const off = join(tmp, 'off');
  execFileSync('npx', ['vite', 'build', '--outDir', off, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: ROOT,
    env: { ...process.env, TARPIT_SW: 'off' },
    stdio: 'pipe',
  });
  const site: Site = { dir: A, hits: [] };
  const srv = await serve(site);
  await page.goto(`${srv.origin}/`);
  await waitActive(page);
  let navs = 0;
  page.on('framenavigated', (f) => f === page.mainFrame() && navs++);
  site.dir = off;
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
  await expect.poll(() => navs).toBeGreaterThanOrEqual(1);
  await page.waitForTimeout(4000); // a loop would keep counting
  expect(navs).toBe(1);
  const st = await page.evaluate(async () => ({ regs: (await navigator.serviceWorker.getRegistrations()).length, caches: await caches.keys() }));
  expect(st).toEqual({ regs: 0, caches: [] });
  await srv.close();
});
