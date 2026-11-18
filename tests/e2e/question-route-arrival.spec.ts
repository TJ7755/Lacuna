import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { openEmptyDashboard } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';
import type * as QuestionAuthoringFixture from './fixtures/questionAuthoring';

declare global {
  interface Window {
    QuestionAuthoringFixture: typeof QuestionAuthoringFixture;
  }
}

test('old Question bookmarks use the shared library and native attempts while retaining earlier history', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openEmptyDashboard(page);
  const fixture = await build({
    entryPoints: ['tests/e2e/fixtures/questionAuthoring.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'QuestionAuthoringFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  const { courseId } = await page.evaluate(() => window.QuestionAuthoringFixture.seedTransition());
  await page.evaluate((id) => {
    location.hash = `#/course/${id}/questions/learn?mode=all-due`;
  }, courseId);
  await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Addition application', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Quadratic practice', exact: true }),
  ).toBeVisible();
  await page.getByText('Earlier question history', { exact: true }).click();
  await page.locator('details').getByText('Addition application', { exact: true }).click();
  await expect(page.getByText('1 previous review.', { exact: false })).toBeVisible();
  const screenshot = info.outputPath('migrated-question-library.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await info.attach('migrated-question-library', { path: screenshot, contentType: 'image/png' });
  const row = page
    .locator('.qs-library-row')
    .filter({ has: page.getByRole('heading', { name: 'Addition application', exact: true }) });
  await row.getByRole('button', { name: 'Attempt', exact: true }).click();
  await expect(
    page.getByRole('textbox', { name: 'Your working and answer', exact: true }),
  ).toBeVisible();
  await page.getByRole('textbox', { name: 'Your working and answer', exact: true }).fill('6');
  await page.getByRole('button', { name: 'Submit question', exact: true }).click();
  expect(await readAll(page, 'questionAttempts')).toHaveLength(1);
  expect(await readAll(page, 'questionSetAttempts')).toHaveLength(1);
});
