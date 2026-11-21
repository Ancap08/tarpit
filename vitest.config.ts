import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/sim/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
