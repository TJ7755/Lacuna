import { defineConfig } from '@playwright/test';
import webConfig from './playwright.web.config';

const chromium = webConfig.projects?.find((project) => project.name === 'chromium');
if (!chromium) throw new Error('The web config must provide the Chromium project');

const imageAdvance = '**/study-image-advance.spec.ts';
const studyGrade = '**/study-grade-load.spec.ts';
const sidebarMotion = ['**/sidebar-motion.spec.ts'];

// Functional workers stay separate from serial timing cases. Preserve ordinary local coverage.
export default defineConfig({
  ...webConfig,
  projects: [
    {
      ...chromium,
      name: 'chromium-functional',
      testIgnore: [chromium.testIgnore ?? [], imageAdvance, sidebarMotion, studyGrade].flat(),
    },
    {
      ...chromium,
      name: 'chromium-image-performance',
      testMatch: imageAdvance,
      fullyParallel: false,
      workers: 1,
    },
    {
      ...chromium,
      name: 'chromium-study-performance',
      testMatch: studyGrade,
      fullyParallel: false,
      workers: 1,
    },
    {
      ...chromium,
      name: 'chromium-sidebar-motion',
      testMatch: sidebarMotion,
      fullyParallel: false,
      workers: 1,
    },
  ],
});
