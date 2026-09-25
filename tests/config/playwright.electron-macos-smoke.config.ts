import { defineConfig } from '@playwright/test';

export default defineConfig({
  forbidOnly: !!process.env.CI,
  outputDir: '../../test-results',
  testDir: '../e2e-electron',
  testMatch: 'macos-smoke.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 120_000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
