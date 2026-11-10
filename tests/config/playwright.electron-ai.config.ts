import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const prebuilt = process.env.LACUNA_BROWSER_PREBUILT === 'true';

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  outputDir: '../../test-results',
  testDir: '../e2e-electron',
  // The packaged macOS smoke gate needs a built app and runs under its own config.
  testIgnore: ['packaged-interactions.spec.ts', 'macos-smoke.spec.ts'],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command:
      process.env.CI === 'true' && prebuilt
        ? 'bun scripts/ci-electron-preview.mjs'
        : `${prebuilt ? '' : 'bun run build:assets && '}bunx vite preview --host localhost --port 5173 --strictPort`,
    url: 'http://localhost:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
