// Pure rules for the offline service worker (milestone 32a): cache names and
// which requests it handles. sw.ts uses them in the worker; register.ts uses
// shouldRegister on the page. No DOM or worker globals here, so they are unit
// tested in rules.test.ts.

/** How long the page (and manifest, icons) may take before the cached copy is served. */
export const PAGE_TIMEOUT_MS = 3000;

/** Every cache this game owns starts with this; others on the origin are left alone. */
export const CACHE_PREFIX = 'tarpit-';

/** The cache for one build. `version` is a hash of the built files (scripts/sw-build.ts). */
export function cacheName(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}

/** True for a cache from another build of this game, which activate deletes. */
export function isOldCache(name: string, current: string): boolean {
  return name.startsWith(CACHE_PREFIX) && name !== current;
}

/**
 * How the worker treats a request:
 * - 'page': the page itself (a navigation, the scope root or index.html):
 *   network first, the cached page when offline.
 * - 'hashed': a built file under `<scope>assets/` (content-hashed names):
 *   cache first.
 * - 'other': any other file in scope (manifest, icons): network first.
 * - 'pass': not handled (not GET, another origin, outside the scope, or
 *   sw.js itself); the browser fetches it as if there were no worker.
 */
export type RequestKind = 'page' | 'hashed' | 'other' | 'pass';

export function requestKind(req: { method: string; url: string; mode?: string }, scope: string): RequestKind {
  if (req.method !== 'GET') return 'pass';
  const u = new URL(req.url);
  const s = new URL(scope);
  if (u.origin !== s.origin || !u.pathname.startsWith(s.pathname)) return 'pass';
  const rest = u.pathname.slice(s.pathname.length);
  if (rest === 'sw.js') return 'pass';
  if (req.mode === 'navigate' || rest === '' || rest === 'index.html') return 'page';
  if (rest.startsWith('assets/')) return 'hashed';
  return 'other';
}

/**
 * Register the worker only in a production build and never in the test-only
 * modes (?test=1 freezes time for e2e; ?perf=1 measures frame times).
 */
export function shouldRegister(prod: boolean, search: string): boolean {
  if (!prod) return false;
  const q = new URLSearchParams(search);
  return q.get('test') !== '1' && q.get('perf') !== '1';
}
