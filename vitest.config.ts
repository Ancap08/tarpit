import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/** stays out of the unit run except the asset manifest
    // checker's pure matching logic (milestone 15): include names that one
    // file, so no exclude entry is needed for the other scripts.
    include: ['src/sim/**/*.test.ts', 'src/**/*.test.ts', 'scripts/check-asset-manifest.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
