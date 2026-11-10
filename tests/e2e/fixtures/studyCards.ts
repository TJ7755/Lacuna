import type { Page } from '@playwright/test';
import { build } from 'esbuild';
import { openEmptyDashboard } from './lacunaApp';
import type * as StudyFixture from './studyCardFit';

declare global {
  interface Window {
    StudyCardFitFixture: typeof StudyFixture;
  }
}

let fixture: Promise<string> | undefined;

export async function seedStudyCards(page: Page, ...inputs: Parameters<typeof StudyFixture.seed>) {
  fixture ??= build({
    entryPoints: ['tests/e2e/fixtures/studyCardFit.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'StudyCardFitFixture',
    define: { 'import.meta.env.DEV': 'false' },
  }).then((bundle) => bundle.outputFiles[0].text);
  await openEmptyDashboard(page);
  await page.addScriptTag({ content: await fixture });
  return page.evaluate((args) => window.StudyCardFitFixture.seed(...args), inputs);
}
