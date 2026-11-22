// Builds the offline service worker (src/sw/sw.ts) into a finished site
// folder as sw.js (milestone 32a). vite.config.ts runs it after every
// production build; e2e/install.spec.ts runs it on a changed copy of a build
// to make a second version. The version is a hash of every built file, so
// any change to the site makes a new cache name, and the precache list is
// every file except sw.js, with the page as './' (relative to the scope).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)],
  );
}

/** The version and precache list for the site in `outDir`. */
export function swManifest(outDir: string): { version: string; precache: string[] } {
  const files = walk(outDir)
    .map((p) => relative(outDir, p).split(sep).join('/'))
    .filter((p) => p !== 'sw.js' && !p.endsWith('.DS_Store'))
    .sort();
  const hash = createHash('sha256');
  for (const f of files) hash.update(f).update('\0').update(readFileSync(join(outDir, f))).update('\0');
  const precache = files.map((f) => (f === 'index.html' ? './' : f));
  return { version: hash.digest('hex').slice(0, 12), precache };
}

/** Write `<outDir>/sw.js` for the site already built in `outDir`. Returns the version. */
export async function writeServiceWorker(outDir: string): Promise<string> {
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
