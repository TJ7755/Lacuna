import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import web from '../config/playwright.web.config';

// Reuse a deliberately built before/after bundle; Playwright owns and stops the server.
const port = process.env.PLAYWRIGHT_WEB_PORT ?? '4197';
export default defineConfig({
  ...web,
  workers: 1,
  use: { ...web.use, baseURL: `http://127.0.0.1:${port}` },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: `bunx vite preview --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
