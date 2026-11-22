// Registers the offline service worker (milestone 32a) after the page has
// loaded, so it never competes with the game's first load. Production builds
// only, never under ?test=1 or ?perf=1 (rules.ts). The worker file and its
// scope sit at the Vite base: / locally, /tarpit/ on GitHub Pages.
import { isOwnCache, shouldRegister } from './rules';

/** False in a build made with TARPIT_SW=off (vite.config.ts); true in tests and the dev server. */
declare const __TARPIT_SW__: boolean;
const swOn = typeof __TARPIT_SW__ === 'undefined' ? true : __TARPIT_SW__;

/**
 * Kill switch: unregister this game's worker and delete this copy's caches.
 * The origin is shared (other project sites on github.io, another copy of
 * the game under another path), so only the registration whose scope is
 * exactly this game's base is touched; getRegistration(url) is not used
 * because it can return a parent scope's worker of another site.
 */
function retire(scope: string): void {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.filter((r) => r.scope === scope).map((r) => r.unregister())))
    .then(() => caches.keys())
    .then((names) => Promise.all(names.filter((n) => isOwnCache(n, scope)).map((n) => caches.delete(n))))
    .catch(() => undefined);
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;
  const base = import.meta.env.BASE_URL;
  if (!swOn) return retire(new URL(base, window.location.href).href);
  if (!shouldRegister(import.meta.env.PROD, window.location.search)) return;
  window.addEventListener('load', () => {
    // update() checks sw.js on every open (past the HTTP cache), so a new
    // deploy's worker installs now and its cache is ready for the next one.
    navigator.serviceWorker
      .register(`${base}sw.js`, { scope: base })
      .then((reg) => reg.update())
      .catch(() => {
        // No worker (private mode, blocked storage): the game still plays online.
      });
  });
}
