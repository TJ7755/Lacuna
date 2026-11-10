import { defineConfig } from '@playwright/test';
import webConfig from './playwright.web.config';

const chromium = webConfig.projects?.find((project) => project.name === 'chromium');
if (!chromium) throw new Error('The web config must provide the Chromium project');

const imageAdvance = '**/study-image-advance.spec.ts';
const studyGrade = '**/study-grade-load.spec.ts';
const studySession = '**/study-session-load.spec.ts';

// Functional workers stay separate from serial timing cases. Preserve ordinary local coverage.
export default defineConfig({
  ...webConfig,
  projects: [
    {
      ...chromium,
      name: 'chromium-functional',
      testIgnore: [chromium.testIgnore ?? [], imageAdvance, studyGrade, studySession].flat(),
      // Screenshots cover the first failure. Record a trace only on the retry.
      use: { ...chromium.use, trace: process.env.CI ? 'on-first-retry' : chromium.use?.trace },
    },
    {
      ...chromium,
      name: 'chromium-image-performance',
      testMatch: imageAdvance,
      // The test attaches paint timings and still captures failure screenshots.
      // Tracing copies hundreds of MB of fixture media and instruments each action.
      use: { ...chromium.use, trace: 'off' },
      fullyParallel: false,
      workers: 1,
    },
    {
      ...chromium,
      name: 'chromium-study-performance',
      testMatch: [studyGrade, studySession],
      // Let Playwright shard independent cases. Each runner still measures one at a time.
      fullyParallel: true,
      workers: 1,
    },
  ],
});
