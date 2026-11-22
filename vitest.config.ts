import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/** stays out of the unit run except the asset manifest
    // checker's pure matching logic (milestone 15) and the icon encoder
    // (milestone 32a): include names those files,
    // so no exclude entry is needed for the other scripts.
    include: ['src/sim/**/*.test.ts', 'src/**/*.test.ts', 'scripts/check-asset-manifest.test.ts', 'scripts/make-icons.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    // Milestone 27 follow-up: one limit for every test instead of per-test
    // overrides. Whole-game tests run 2 to 10 s here and about 1.7 times
    // longer on CI, past vitest's 5 s default. Only a test that needs more
    // than this keeps its own limit. `npm run test:slow` lists tests over 3 s.
    testTimeout: 30_000,
  },
});
