import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import webConfig from './playwright.web.config';

const directory = process.env.LACUNA_BROWSER_RUN_DIR;
if (!directory) throw new Error('Run this configuration through bun run verify:browser');
const port = process.env.PLAYWRIGHT_WEB_PORT ?? '4173';
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export default defineConfig({
  ...webConfig,
  outputDir: join(directory, 'test-results'),
  reporter: [
    ['list'],
    ['html', { outputFolder: join(directory, 'report'), open: 'never' }],
    ['json', { outputFile: join(directory, 'results.json') }],
  ],
  webServer: {
    ...webConfig.webServer,
    command: `bunx vite preview --host 127.0.0.1 --port ${quote(port)} --strictPort --outDir ${quote(join(directory, 'dist'))}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
