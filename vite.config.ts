import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { writeServiceWorker } from './scripts/sw-build.ts';

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
      console.log(`service worker: sw.js, cache tarpit-${version}`);
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
  plugins: [serviceWorker()],
});
