import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_WEB_PORT ?? '4173';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  outputDir: '../../test-results',
  testDir: '../e2e',
  // Each spec provisions its own page/context and intercepts relay traffic on
  // that page. Keep local runs serial and use two isolated workers in CI.
  fullyParallel: process.env.CI === 'true',
  workers: process.env.CI === 'true' ? 2 : 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    reducedMotion: 'no-preference',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile-pwa-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-mobile',
      testMatch: '**/mobile-pwa-smoke.spec.ts',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: `bun run build:assets && bunx vite preview --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
