import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages serves the site from /tarpit/; the deploy workflow sets VITE_BASE.
  base: process.env.VITE_BASE ?? '/',
  build: {
    // Phaser alone is about 1.2 MB minified; warn only above that.
    chunkSizeWarningLimit: 1500,
  },
});
