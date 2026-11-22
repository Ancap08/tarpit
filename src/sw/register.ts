// Registers the offline service worker (milestone 32a) after the page has
// loaded, so it never competes with the game's first load. Production builds
// only, never under ?test=1 or ?perf=1 (rules.ts). The worker file and its
// scope sit at the Vite base: / locally, /tarpit/ on GitHub Pages.
import { shouldRegister } from './rules';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || !shouldRegister(import.meta.env.PROD, window.location.search)) return;
  const base = import.meta.env.BASE_URL;
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
