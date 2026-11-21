import { defineConfig, devices } from '@playwright/test';

/**
 * Preview server port. A second checkout runs with PW_PORT=4174 so two
 * worktrees never share a server (reuseExistingServer is off below).
 */
const PORT = Number(process.env.PW_PORT ?? 4173);

/** Specs that run only in the tablet project (and never on the desktop one). */
const TABLET_SPECS = [/touch\.spec\.ts$/, /touch-drag\.spec\.ts$/, /touch-verifier\.spec\.ts$/, /visual-tablet\.spec\.ts$/];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // Baselines have no platform suffix: they are generated on CI (Linux) by
  // .github/workflows/update-snapshots.yml. Local runs skip pixel comparisons
  // because macOS renders text differently from CI Linux.
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}{ext}',
  ignoreSnapshots: !process.env.CI,
  // On CI a missing baseline is a failure, not a silent write that the retry
  // then passes against. --update-snapshots on the command line overrides this.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  expect: { toHaveScreenshot: { maxDiffPixels: 100 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  // ignoreSnapshots and updateSnapshots above apply to both projects.
  projects: [
    {
      name: 'chromium',
      // A 960x580 viewport makes the Scale.FIT canvas exactly 960x580 at
      // (0,0), so canvas coordinates from window.__tarpit.uiRects() are page
      // coordinates for page.mouse.click.
      testIgnore: TABLET_SPECS,
      use: { ...devices['Desktop Chrome'], viewport: { width: 960, height: 580 }, deviceScaleFactor: 1 },
    },
    {
      name: 'tablet',
      // iPad landscape (milestone 14): the canvas fits at 1024 / 960 with
      // letterboxing above and below; specs map canvas points to the page
      // with window.__tarpit.canvasToPage() and tap with page.touchscreen.
      testMatch: TABLET_SPECS,
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  // Serve the production build so e2e tests what ships. Run `npm run build` first.
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // Never reuse: a server already on the port may be another checkout's
    // build. With --strictPort a busy port fails the run loudly.
    reuseExistingServer: false,
  },
});
