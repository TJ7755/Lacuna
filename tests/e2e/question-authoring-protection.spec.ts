import { expect, test, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { openEmptyDashboard } from './fixtures/lacunaApp';
import type * as QuestionAuthoringFixture from './fixtures/questionAuthoring';

declare global {
  interface Window {
    QuestionAuthoringFixture: typeof QuestionAuthoringFixture;
  }
}

let fixture: Promise<string> | undefined;

async function openEditor(page: Page, withDraft = false) {
  fixture ??= build({
    entryPoints: ['tests/e2e/fixtures/questionAuthoring.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'QuestionAuthoringFixture',
    define: { 'import.meta.env.DEV': 'false' },
  }).then((bundle) => bundle.outputFiles[0].text);
  await openEmptyDashboard(page);
  await page.addScriptTag({ content: await fixture });
  const ids = await page.evaluate(
    (withDraft) => window.QuestionAuthoringFixture.seed(withDraft),
    withDraft,
  );
  await page.evaluate((courseId) => {
    location.hash = `#/course/${courseId}/questions/new`;
  }, ids.courseId);
  await expect(page.getByRole('textbox', { name: 'Prompt', exact: true })).toBeVisible();
  return ids;
}

test('a pending Question save prevents edits and repeat-save restores keyboard entry', async ({
  page,
}, testInfo) => {
  const { conceptId } = await openEditor(page);
  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  await prompt.fill('What is 2 + 2?');
  await page.getByRole('textbox', { name: 'Expected answer', exact: true }).fill('4');
  await page.getByRole('textbox', { name: 'Worked explanation' }).fill('Two pairs make four.');
  await page.getByPlaceholder('Completing the square').fill('Addition');
  await page.getByRole('combobox', { name: 'Primary skill practised' }).selectOption(conceptId);
  await page.evaluate(() => window.QuestionAuthoringFixture.blockWrites());
  try {
    await page.getByRole('button', { name: 'Save & add another' }).click();
    await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(prompt).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Generated family' })).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('pending-save.png'), fullPage: true });
  } finally {
    await page.evaluate(() => window.QuestionAuthoringFixture.releaseWrites());
  }
  await expect(prompt).toBeEnabled();
  await expect(prompt).toHaveValue('');
  await expect(prompt).toBeFocused();
  await page.keyboard.type('The next question');
  await expect(prompt).toHaveValue('The next question');
});

test('an existing draft requires a decision before authoring or saving', async ({
  page,
}, testInfo) => {
  await openEditor(page, true);
  const restore = page.getByRole('button', { name: 'Restore draft' });
  await expect(restore).toBeVisible();
  const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
  await expect(prompt).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create Question' })).toBeDisabled();
  await restore.focus();
  await page.keyboard.press('Control+Enter');
  await expect(restore).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('restore-decision.png'), fullPage: true });
  await restore.click();
  await expect(prompt).toBeEnabled();
  await expect(prompt).toHaveValue('Recovered question');
  await expect(prompt).toBeFocused();
  await page.getByRole('button', { name: 'Create Question' }).click();
  await expect(page).toHaveURL(/questions\?view=individual$/);
});
