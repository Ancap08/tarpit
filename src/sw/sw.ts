// The offline service worker (milestone 32a), built to <base>sw.js by
// scripts/sw-build.ts with this build's version and file list.
//
// - Install: cache every file of this build (fetched past the HTTP cache)
//   into the cache named for this build, then skipWaiting.
// - Activate: delete the caches of other builds, then clients.claim.
// - Fetch: the page is network first (a new deploy that answers 200 shows
//   on the next open) with this build's cached page as the fallback when
//   the network fails, answers not ok, or takes over PAGE_TIMEOUT_MS;
//   files under assets/ have content-hashed names and are cache first; other
//   files in scope (manifest, icons) are network first. Anything else
//   passes through (rules.ts).
//
// Why old and new files never mix: each cache holds exactly one build, put
// there at install and never overwritten by a network page, so the fallback
// page and the assets it names come from the same build. Online, the page
// comes from the network and names only its own hashed files; a hashed name
// always means the same bytes, so a cache hit is never a wrong file. A
// hashed file in no cache (an old tab after an update) goes to the network,
// and whatever it answers is returned.
import { cacheName, isOldCache, PAGE_TIMEOUT_MS, requestKind } from './rules';

declare const __SW_VERSION__: string;
declare const __SW_PRECACHE__: string[];

// Minimal worker types: the project's lib is DOM, which lacks them, and the
// WebWorker lib cannot be mixed into the same program.
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  readonly request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
interface WorkerScope {
  registration: { scope: string };
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  addEventListener(type: 'install' | 'activate', fn: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', fn: (e: FetchEvent) => void): void;
}

const sw = self as unknown as WorkerScope;
const CACHE = cacheName(__SW_VERSION__);
const scope = sw.registration.scope;

sw.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(__SW_PRECACHE__.map((p) => new Request(new URL(p, scope).href, { cache: 'reload' }))))
      .then(() => sw.skipWaiting()),
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => isOldCache(n, CACHE)).map((n) => caches.delete(n))))
      .then(() => sw.clients.claim()),
  );
});

/**
 * Network first, with this build's cached copy of `fallbackUrl` when the
 * network fails, answers not ok (an outage's 404 or 5xx), or takes longer
 * than PAGE_TIMEOUT_MS (a hanging connection). With no cached copy it waits
 * for the network whatever it does. The network answer is never cached.
 */
async function networkFirst(req: Request, fallbackUrl: string): Promise<Response> {
  // no-cache revalidates with the server, so a new deploy is never hidden
  // behind the HTTP cache's max-age.
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
  const cached = await (await caches.open(CACHE)).match(fallbackUrl);
  if (!cached) return network;
  network.catch(() => undefined); // a late failure after the fallback is not an error
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((r) => {
    timer = setTimeout(() => r(null), PAGE_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([network, timeout]);
    return res && res.ok ? res : cached;
  } catch {
    return cached;
  } finally {
    clearTimeout(timer);
  }
}

async function cacheFirst(req: Request): Promise<Response> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

sw.addEventListener('fetch', (event) => {
  const req = event.request;
  const kind = requestKind(req, scope);
  if (kind === 'pass') return;
  if (kind === 'page') event.respondWith(networkFirst(req, scope));
  else if (kind === 'hashed') event.respondWith(cacheFirst(req));
  else event.respondWith(networkFirst(req, req.url));
});
