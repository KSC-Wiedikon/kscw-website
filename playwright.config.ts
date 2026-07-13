import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4322',
    trace: 'on-first-retry',
    reducedMotion: 'no-preference',
  },
  // Own port (4322), never reused. `astro dev` runs on 4321, and with
  // reuseExistingServer a stray dev server would silently serve the whole suite:
  // the tests would then run against a dev build whose dev toolbar injects its
  // own <h1>/<h3> into every page, breaking the heading-hierarchy assertions
  // for reasons that have nothing to do with the site. Always start our own
  // preview of the production build instead.
  webServer: {
    command: 'npx astro preview --port 4322',
    url: 'http://localhost:4322',
    reuseExistingServer: false,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], viewport: { width: 375, height: 667 } },
    },
  ],
});
