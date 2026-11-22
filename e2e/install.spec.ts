import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { writeServiceWorker } from '../scripts/sw-build.ts';
import { waitForTitle } from './title';

// Milestone 32a: install to the home screen and play offline.
//
// The manifest, tag and registration checks run against the preview server
// (dist/, base /). The offline and update checks serve a copy of a build from
// a small static server in this file, so a test can swap the build it serves
// (build A, then build B) and stop it (really offline, on top of
// context.setOffline). Build B is build A with one changed file (index.html)
// and its sw.js rebuilt by the same scripts/sw-build.ts the build uses, so it
// has a new cache version. The /tarpit/ group builds the game with
// VITE_BASE=/tarpit/ into a temp folder and serves it under /tarpit/, as
// GitHub Pages does.

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BEST = JSON.stringify({ v: 1, best: { meadow: { easy: 7, normal: 3 } } });
type Rect = { x: number; y: number; width: number; height: number };

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
};

/** A static server for `site.dir` mounted at `mount` (plus fixed `extra` files by path) ('/' or '/tarpit/'); `site.dir` may change between requests. */
async function serve(
  site: { dir: string },
  mount: string,
  extra: Record<string, { type: string; body: string }> = {},
): Promise<{ origin: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    const e = extra[path];
    if (e) return void res.writeHead(200, { 'content-type': e.type }).end(e.body);
    if (!path.startsWith(mount)) return void res.writeHead(404).end();
    let rel = normalize(path.slice(mount.length));
    if (rel === '.' || rel === '' || rel.endsWith('/')) rel = join(rel, 'index.html');
    try {
      const body = readFileSync(join(site.dir, rel));
      res.writeHead(200, { 'content-type': MIME[extname(rel)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  };
}

function pngSize(buf: Buffer): string {
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

/** The manifest is linked and valid, every icon it names has its stated size, and the iOS tags are there. */
async function checkManifestAndTags(page: Page, url: string, base: string): Promise<void> {
  await page.goto(url);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe(`${base}manifest.webmanifest`);
  const manifestUrl = new URL(href!, page.url()).href;
  const res = await page.request.get(manifestUrl);
  expect(res.ok()).toBe(true);
  const m = JSON.parse(await res.text());
  expect(m).toMatchObject({ name: 'Tarpit', short_name: 'Tarpit', display: 'standalone' });
  expect(m.orientation).toBeUndefined();
  // No id: the start URL identifies the app, so /tarpit/ never collides with another site on the origin.
  expect(m.id).toBeUndefined();
  // start_url and scope resolve against the manifest's own address: the site root.
  expect(new URL(m.start_url, manifestUrl).pathname).toBe(base);
  expect(new URL(m.scope, manifestUrl).pathname).toBe(base);
  expect(m.icons.map((i: { purpose: string }) => i.purpose).sort()).toEqual(['any', 'any', 'maskable']);
  for (const icon of m.icons as { src: string; sizes: string; type: string }[]) {
    const r = await page.request.get(new URL(icon.src, manifestUrl).href);
    expect(r.ok(), icon.src).toBe(true);
    expect(icon.type).toBe('image/png');
    expect(pngSize(await r.body()), icon.src).toBe(icon.sizes);
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(apple).toBe(`${base}icons/apple-touch-icon.png`);
  expect(pngSize(await (await page.request.get(new URL(apple!, page.url()).href)).body())).toBe('180x180');
  const meta = (name: string) => page.locator(`meta[name="${name}"]`).getAttribute('content');
  expect(await meta('apple-mobile-web-app-capable')).toBe('yes');
  expect(await meta('mobile-web-app-capable')).toBe('yes');
  expect(await meta('apple-mobile-web-app-status-bar-style')).toBe('black-translucent');
  expect(await meta('apple-mobile-web-app-title')).toBe('Tarpit');
  expect(await meta('theme-color')).toBe('#111418');
}

/** Wait until a service worker controls the page and return the cache names it made. */
async function waitForWorker(page: Page): Promise<string[]> {
  // waitForFunction treats a returned Promise as truthy, so async checks poll here.
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? 'none'))
    .toBe('activated');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  return page.evaluate(() => caches.keys());
}

/** The game starts: the title is ready and Play opens the game scene. */
async function playStarts(page: Page): Promise<void> {
  await waitForTitle(page);
  const r = await page.evaluate(() => window.__tarpit?.uiRects()['title:play'] as Rect | undefined);
  expect(r).toBeTruthy();
  await page.mouse.click(r!.x + r!.width / 2, r!.y + r!.height / 2);
  await page.waitForFunction(() => window.__tarpit?.game.scene.isActive('game'));
}

async function goOffline(context: BrowserContext, stop: () => Promise<void>): Promise<void> {
  await stop();
  await context.setOffline(true);
}

test.describe('install and offline, base /', () => {
  test('manifest, icons and iOS tags on the preview build', async ({ page }) => {
    await checkManifestAndTags(page, '/', '/');
  });

  test('the canvas stays inside the safe area on a notched phone, landscape and portrait', async ({ browser }) => {
    // Chromium's Emulation.setSafeAreaInsetsOverride stands in for a notch
    // and a home bar (390 x 844 phone); env(safe-area-inset-*) then applies.
    for (const [w, h, insets] of [
      [844, 390, { left: 47, right: 47, bottom: 21 }],
      [390, 844, { top: 47, bottom: 34 }],
    ] as const) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await (await ctx.newCDPSession(page)).send('Emulation.setSafeAreaInsetsOverride', { insets });
      await page.goto('/?test=1');
      await page.waitForFunction(() => document.querySelector('canvas') !== null);
      const box = await page.evaluate(() => {
        const c = document.querySelector('canvas')!.getBoundingClientRect();
        const e = document.documentElement;
        return { ...c.toJSON(), sw: e.scrollWidth, sh: e.scrollHeight, layout: window.__tarpit!.layout() };
      });
      const i: Record<'top' | 'right' | 'bottom' | 'left', number> = { top: 0, right: 0, bottom: 0, left: 0 };
      Object.assign(i, insets);
      expect(box.left).toBeGreaterThanOrEqual(i.left);
      expect(box.top).toBeGreaterThanOrEqual(i.top);
      expect(box.right).toBeLessThanOrEqual(w - i.right + 0.5);
      expect(box.bottom).toBeLessThanOrEqual(h - i.bottom + 0.5);
      expect([box.sw, box.sh]).toEqual([w, h]); // nothing scrolls
      // Milestone 32b: a tall phone gets the portrait layout (it replaced the rotate card).
      expect(box.layout).toBe(h > w ? 'portrait' : 'landscape');
      await ctx.close();
    }
  });

  test('the service worker registers in a production build', async ({ page }) => {
    await page.goto('/');
    const names = await waitForWorker(page);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/^tarpit\|\/\|[0-9a-f]{12}$/);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope)).toBe(
      new URL('/', page.url()).href,
    );
  });

  test('no service worker under ?test=1 or ?perf=1', async ({ page }) => {
    for (const q of ['?test=1', '?perf=1']) {
      await page.goto(`/${q}`);
      await waitForTitle(page);
      await page.waitForTimeout(500); // past the load event, when the page would register
      expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length)), q).toBe(0);
    }
  });

  test('plays offline after one visit; a new build is picked up online and the old cache is gone', async ({ page, context }) => {
    const tmp = mkdtempSync(join(tmpdir(), 'tarpit-sw-'));
    try {
      const a = join(tmp, 'a');
      const b = join(tmp, 'b');
      cpSync(join(ROOT, 'dist'), a, { recursive: true });
      cpSync(a, b, { recursive: true });
      const html = readFileSync(join(b, 'index.html'), 'utf8');
      writeFileSync(join(b, 'index.html'), html.replace('</head>', '<meta name="tarpit-build" content="B" /></head>'));
      const versionB = await writeServiceWorker(b);

      const site = { dir: a };
      const server = await serve(site, '/');
      await page.goto(`${server.origin}/`);
      await page.evaluate((v) => localStorage.setItem('tarpit.best', v), BEST);
      const [cacheA] = await waitForWorker(page);
      expect(cacheA).not.toBe(`tarpit|/|${versionB}`);

      // Build B is deployed: the next online open shows it (network first)...
      site.dir = b;
      await page.reload();
      await expect(page.locator('meta[name="tarpit-build"]')).toHaveAttribute('content', 'B');
      // ...and its worker takes over and deletes build A's cache.
      await expect.poll(() => page.evaluate(() => caches.keys())).toEqual([`tarpit|/|${versionB}`]);
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

      // An old tab asking for build A's bundle after the update: it is in no
      // cache, so the worker goes to the network and returns its answer (here
      // a 404, as on Pages after a deploy), never another file and never a hang.
      const oldJs = 'index-0ldBu1ld.js'; // a hashed name in no cache and not on the server
      const fetchStatus = (u: string) =>
        page.evaluate(async (url) => {
          const t = new Promise<string>((r) => setTimeout(() => r('hung'), 5000));
          return Promise.race([fetch(url).then((r) => String(r.status), () => 'network error'), t]);
        }, u);
      expect(await fetchStatus(`/assets/${oldJs}`)).toBe('404');

      // Offline (server stopped and the context offline): the cached build B starts and plays.
      await goOffline(context, server.close);
      await page.reload();
      await expect(page.locator('meta[name="tarpit-build"]')).toHaveAttribute('content', 'B');
      // Offline, a hashed file in no cache is a network error at once, not a hang.
      expect(await fetchStatus(`/assets/${oldJs}`)).toBe('network error');
      await playStarts(page);
      expect(await page.evaluate(() => localStorage.getItem('tarpit.best'))).toBe(BEST);
      await context.setOffline(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

test.describe('install and offline, base /tarpit/ (GitHub Pages paths)', () => {
  test.describe.configure({ mode: 'serial' });
  let tmp = '';
  test.beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tarpit-pages-'));
    for (const [dir, off] of [['site', false], ['off', true]] as const) {
      execFileSync('npx', ['vite', 'build', '--outDir', join(tmp, dir), '--emptyOutDir', '--logLevel', 'warn'], {
        cwd: ROOT,
        env: { ...process.env, VITE_BASE: '/tarpit/', ...(off ? { TARPIT_SW: 'off' } : {}) },
        stdio: 'pipe',
      });
    }
  });
  test.afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  // A sibling site on the same origin (as other project sites share
  // ancap08.github.io): its own worker at /other/ with its own cache, plus a
  // cache named as another copy of the game would name it (/preview/).
  const SIBLING = {
    '/other/': {
      type: 'text/html',
      body: "<!doctype html><title>other</title><script>navigator.serviceWorker.register('/other/sw.js', { scope: '/other/' })</script>",
    },
    '/other/sw.js': {
      type: 'text/javascript',
      body: `self.addEventListener('install', (e) => e.waitUntil(caches.open('other-v1').then((c) => c.put('/other/x', new Response('x'))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));`,
    },
  };
  const PREVIEW_CACHE = 'tarpit|/preview/|abc123';
  const originState = (page: Page) =>
    page.evaluate(async () => ({
      scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).sort(),
      caches: (await caches.keys()).sort(),
    }));
  async function installSibling(page: Page, origin: string): Promise<void> {
    await page.goto(`${origin}/other/`);
    expect(await waitForWorker(page)).toContain('other-v1');
    await page.evaluate((n) => caches.open(n).then((c) => c.put('/preview/', new Response('p'))), PREVIEW_CACHE);
  }

  test('with a sibling site on the origin: the update and the kill switch touch only this game', async ({ page }) => {
    // Build B: the /tarpit/ build with one changed file and its sw.js rebuilt.
    const b = join(tmp, 'b');
    cpSync(join(tmp, 'site'), b, { recursive: true });
    writeFileSync(join(b, 'index.html'), readFileSync(join(b, 'index.html'), 'utf8').replace('</head>', '<meta name="tarpit-build" content="B" /></head>'));
    const versionB = await writeServiceWorker(b);
    const site = { dir: join(tmp, 'site') };
    const server = await serve(site, '/tarpit/', SIBLING);
    await installSibling(page, server.origin);

    await page.goto(`${server.origin}/tarpit/`);
    const [, , cacheA] = (await waitForWorker(page)).sort();
    expect(cacheA).toMatch(/^tarpit\|\/tarpit\/\|[0-9a-f]{12}$/);

    // Update to B: activate deletes A's cache and nothing else.
    site.dir = b;
    await page.reload();
    await expect
      .poll(() => originState(page))
      .toEqual({ scopes: ['/other/', '/tarpit/'], caches: ['other-v1', PREVIEW_CACHE, `tarpit|/tarpit/|${versionB}`].sort() });

    // Kill switch deployed for /tarpit/: the game's worker and caches go, the sibling's stay.
    site.dir = join(tmp, 'off');
    await page.reload();
    await expect.poll(() => originState(page)).toEqual({ scopes: ['/other/'], caches: ['other-v1', PREVIEW_CACHE].sort() });
    await page.goto(`${server.origin}/other/`);
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await server.close();
  });

  test('with a sibling site: the retiring sw.js alone removes only this game', async ({ page }) => {
    const site = { dir: join(tmp, 'site') };
    const server = await serve(site, '/tarpit/', SIBLING);
    await installSibling(page, server.origin);
    await page.goto(`${server.origin}/tarpit/`);
    await waitForWorker(page);
    site.dir = join(tmp, 'off');
    const reloaded = page.waitForEvent('load');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    await reloaded;
    await expect.poll(() => originState(page)).toEqual({ scopes: ['/other/'], caches: ['other-v1', PREVIEW_CACHE].sort() });
    await server.close();
  });

  test('manifest, icons, tags, worker scope and offline play under /tarpit/', async ({ page, context }) => {
    const server = await serve({ dir: join(tmp, 'site') }, '/tarpit/');
    await checkManifestAndTags(page, `${server.origin}/tarpit/`, '/tarpit/');
    await page.evaluate((v) => localStorage.setItem('tarpit.best', v), BEST);
    const names = await waitForWorker(page);
    expect(names).toHaveLength(1);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.scope)).toBe(
      `${server.origin}/tarpit/`,
    );
    await goOffline(context, server.close);
    await page.reload();
    await playStarts(page);
    expect(await page.evaluate(() => localStorage.getItem('tarpit.best'))).toBe(BEST);
    await context.setOffline(false);
  });
});

test.describe('kill switch: a TARPIT_SW=off deploy retires the worker', () => {
  test.describe.configure({ mode: 'serial' });
  let tmp = '';
  test.beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tarpit-off-'));
    execFileSync('npx', ['vite', 'build', '--outDir', join(tmp, 'off'), '--emptyOutDir', '--logLevel', 'warn'], {
      cwd: ROOT,
      env: { ...process.env, TARPIT_SW: 'off' },
      stdio: 'pipe',
    });
  });
  test.afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  const state = (page: Page) =>
    page.evaluate(async () => ({
      regs: (await navigator.serviceWorker.getRegistrations()).length,
      caches: (await caches.keys()).filter((n) => n.startsWith('tarpit|')),
      controlled: navigator.serviceWorker.controller !== null,
    }));

  test('the next online open leaves no registration and no caches, and the game plays', async ({ page }) => {
    expect(readFileSync(join(tmp, 'off', 'sw.js'), 'utf8')).toContain('unregister');
    const site = { dir: join(ROOT, 'dist') };
    const server = await serve(site, '/');
    await page.goto(`${server.origin}/`);
    expect(await waitForWorker(page)).toHaveLength(1);
    site.dir = join(tmp, 'off');
    await page.reload();
    await expect.poll(() => state(page)).toEqual({ regs: 0, caches: [], controlled: expect.any(Boolean) });
    await page.reload(); // the open after that is a plain network page
    expect(await state(page)).toEqual({ regs: 0, caches: [], controlled: false });
    await playStarts(page);
    await server.close();
  });

  test('the retiring sw.js alone removes itself and its caches and reloads open pages', async ({ page }) => {
    const site = { dir: join(ROOT, 'dist') };
    const server = await serve(site, '/');
    await page.goto(`${server.origin}/`);
    await waitForWorker(page);
    site.dir = join(tmp, 'off');
    // No reload: the old page's own update check fetches the retiring sw.js,
    // which must clean up and send the page back to the network by itself.
    const reloaded = page.waitForEvent('load');
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    await reloaded;
    await expect.poll(() => state(page)).toEqual({ regs: 0, caches: [], controlled: false });
    await server.close();
  });
});
