import { defineConfig } from '@playwright/test';
import webConfig from './playwright.web.config';

const chromium = webConfig.projects?.find((project) => project.name === 'chromium');
if (!chromium) throw new Error('The web config must provide the Chromium project');

const imageAdvance = '**/study-image-advance.spec.ts';

// CI selects one project per job. Keep the normal web config's local coverage intact.
export default defineConfig({
  ...webConfig,
  projects: [
    {
      ...chromium,
      name: 'chromium-functional',
      testIgnore: [chromium.testIgnore ?? [], imageAdvance].flat(),
    },
    {
      ...chromium,
      name: 'chromium-image-performance',
      testMatch: imageAdvance,
      fullyParallel: false,
      workers: 1,
    },
  ],
});
