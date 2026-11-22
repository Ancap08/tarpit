import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { swEnabled, writeServiceWorker } from './scripts/sw-build.ts';

/** After a production build, write sw.js for it (milestone 32a, scripts/sw-build.ts). */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'tarpit-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle(error?: Error) {
      if (error) return;
      const version = await writeServiceWorker(outDir);
      console.log(version === 'off' ? 'service worker: retired (TARPIT_SW=off)' : `service worker: sw.js, version ${version}`);
    },
  };
}

export default defineConfig({
  // GitHub Pages serves the site from /tarpit/; the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  build: {
    // Phaser alone is about 1.2 MB minified; warn only above that.
    chunkSizeWarningLimit: 1500,
  },
  // TARPIT_SW=off builds a deploy that retires the worker (scripts/sw-build.ts).
  define: { __TARPIT_SW__: JSON.stringify(swEnabled()) },
  plugins: [serviceWorker()],
});
