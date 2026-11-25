import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { KEEP_TEXT, TITLE_TEXT } from './src/game/names.ts';
import { KEEP_LOAD_LIMIT_MS } from './src/game/keep/status.ts';
import { swEnabled, writeServiceWorker } from './scripts/sw-build.ts';
import { KEEP_ASSET_DIR, PAINTED_ASSET_DIR, SHOWPIECE_ASSET_DIR } from './src/sw/rules.ts';

/** After a production build, write sw.js for it (milestone 32a, scripts/sw-build.ts). */
function serviceWorker(): Plugin {
  let outDir = '';
  return {
    name: 'tarpit-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'assets/fonts/OFL.txt', source: readFileSync('assets/fonts/OFL.txt') });
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
    rollupOptions: {
      output: {
        chunkFileNames: chunk => {
          if (chunk.name === 'oldKeep') return KEEP_ASSET_DIR + '[name]-[hash].js';
          if (chunk.name === 'showpiece') return SHOWPIECE_ASSET_DIR + '[name]-[hash].js';
          return 'assets/[name]-[hash].js';
        },
        assetFileNames: ({ originalFileNames }) => {
          if (originalFileNames.some(path => path.startsWith('assets/art-showpiece/')))
            return `${SHOWPIECE_ASSET_DIR}[name]-[hash][extname]`;
          if (originalFileNames.some((path) => path.startsWith('assets/art-painted/')))
            return `${PAINTED_ASSET_DIR}[name]-[hash][extname]`;
          if (originalFileNames.some((path) => path.startsWith('assets/fonts/')))
            return 'assets/fonts/[name]-[hash][extname]';
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
  },
  // TARPIT_SW=off builds a deploy that retires the worker (scripts/sw-build.ts).
  define: {
    __TARPIT_SW__: JSON.stringify(swEnabled()),
    'import.meta.env.LOADING_TEXT': JSON.stringify(TITLE_TEXT.loading),
  },
  plugins: [{
    name: 'keep-status-copy',
    transformIndexHtml: html => html
      .replaceAll('%KEEP_LOADING_TEXT%', KEEP_TEXT.loading)
      .replace('%KEEP_BACK_TEXT%', KEEP_TEXT.back)
      .replace('%KEEP_FAILED_TEXT%', KEEP_TEXT.failed)
      .replace('%KEEP_LOAD_LIMIT_MS%', String(KEEP_LOAD_LIMIT_MS)),
  }, serviceWorker()],
});
