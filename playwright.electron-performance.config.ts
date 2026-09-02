import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e-electron',
  testMatch: 'packaged-interactions.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  timeout: 180_000,
  use: {
    colorScheme: 'light',
    locale: 'en-GB',
    screenshot: 'only-on-failure',
    trace: 'off',
  },
});
