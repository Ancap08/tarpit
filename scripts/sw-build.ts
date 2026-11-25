// Builds the offline service worker (src/sw/sw.ts) into a finished site
// folder as sw.js (milestone 32a). vite.config.ts runs it after every
// production build; e2e/install.spec.ts runs it on a changed copy of a build
// to make a second version. The version is a hash of every built file, so
// any change to the site makes a new cache name, and the precache list is
// every core file except sw.js, with the page as './' (relative to the scope).
// Painted files use the on-demand cache-first route for hashed assets.
//
// Kill switch: with TARPIT_SW=off (swEnabled() false) it writes RETIRE_SW
// instead, a worker that removes itself; the page built with the same switch
// registers nothing and removes any worker it finds (src/sw/register.ts).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { KEEP_ASSET_DIR, PAINTED_ASSET_DIR, SHOWPIECE_ASSET_DIR } from '../src/sw/rules.ts';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** False when the build is run with TARPIT_SW=off: the deploy retires the worker. */
export function swEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.TARPIT_SW !== 'off';
}

/**
 * The retiring worker: it takes over at once, handles no request (so every
 * fetch goes to the network), deletes this copy's caches, unregisters its
 * own registration, and reloads the pages it controls from the network.
 */
export const RETIRE_SW = `// Tarpit service worker, retired (TARPIT_SW=off): see docs/DESIGN.md, "Install and offline".
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Only this copy's caches (src/sw/rules.ts cachePrefix): the origin is shared.
      const prefix = 'tarpit|' + new URL(self.registration.scope).pathname + '|';
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith(prefix)).map((n) => caches.delete(n)));
      await self.registration.unregister();
      const pages = await self.clients.matchAll({ type: 'window' });
      await Promise.all(pages.map((c) => c.navigate(c.url).catch(() => undefined)));
    })(),
  );
});
`;

/** The version and precache list for the site in `outDir`. */
export function swManifest(outDir: string): { version: string; precache: string[] } {
  const files = walk(outDir)
    .map((p) => relative(outDir, p).split(sep).join('/'))
    .filter((p) => p !== 'sw.js' && !p.endsWith('.DS_Store'))
    .sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update('\0').update(readFileSync(join(outDir, f))).update('\0');
  const precache = files
    .filter((f) => !f.startsWith(KEEP_ASSET_DIR) && !f.startsWith(PAINTED_ASSET_DIR) && !f.startsWith(SHOWPIECE_ASSET_DIR))
    .map((f) => (f === 'index.html' ? './' : f));
  return { version: hash.digest('hex').slice(0, 12), precache };
}

/**
 * Write `<outDir>/sw.js` for the site already built in `outDir`. Returns the
 * version, or 'off' when `enabled` is false (the retiring worker).
 */
export async function writeServiceWorker(outDir: string, enabled = swEnabled()): Promise<string> {
  if (!enabled) {
    writeFileSync(join(outDir, 'sw.js'), RETIRE_SW);
    return 'off';
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { version, precache } = swManifest(outDir);
  await build({
    configFile: false,
    root,
    logLevel: 'warn',
    publicDir: false,
    define: { __SW_VERSION__: JSON.stringify(version), __SW_PRECACHE__: JSON.stringify(precache) },
    build: {
      outDir: resolve(outDir),
      emptyOutDir: false,
      copyPublicDir: false,
      lib: { entry: join(root, 'src/sw/sw.ts'), formats: ['iife'], name: 'tarpitSw', fileName: () => 'sw.js' },
    },
  });
  return version;
}
