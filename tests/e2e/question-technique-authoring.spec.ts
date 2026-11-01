import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { QuestionSetRecord } from '../../apps/web/src/questions/questionSetCodec';
import { parseQuestionBank } from '../../apps/web/src/questions/bank';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('authors criterion techniques separately from knowledge and preserves classification through reload and publication', async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Technique authoring', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Enzyme comparison');
  await page.keyboard.press('Enter');
  const prompt = page.getByRole('textbox', { name: 'Q1 question', exact: true });
  await prompt.fill('Compare enzyme activity before and after heating. Explain the difference.');
  await page
    .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
    .fill(
      'Compare binding in both conditions and link the altered active site to reduced binding.\nName the active site.',
    );
  await prompt.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Link to knowledge', exact: true }).click();
  await page
    .getByRole('searchbox', { name: 'Search concepts or cards' })
    .fill('Enzyme active site');
  await page.getByRole('button', { name: 'Create “Enzyme active site”', exact: true }).click();
  await expect(
    page.getByRole('checkbox', { name: 'Enzyme active site', exact: true }),
  ).toBeChecked();
  await prompt.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'What it tests', exact: true }).click();
  const first = page.getByRole('group', { name: /^Point 1 ·/ });
  const second = page.getByRole('group', { name: /^Point 2 ·/ });
  await first.getByRole('combobox', { name: 'Point 1 dimension' }).selectOption('mixed');
  await expect(first.getByRole('combobox', { name: 'Technique taxonomy' })).toHaveValue('');
  await first
    .getByRole('combobox', { name: 'Technique taxonomy' })
    .selectOption('science-techniques');
  await first.getByRole('checkbox', { name: /^Link cause and effect/ }).check();
  await first.getByRole('checkbox', { name: /^Compare like with like/ }).check();
  await second
    .getByRole('combobox', { name: 'Technique taxonomy' })
    .selectOption('science-techniques');
  await expect(second.getByText(/No applicable techniques/)).toBeVisible();
  await page.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const setUrl = page.url();
  await page.goto(`${setUrl}/edit`);
  await prompt.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'What it tests', exact: true }).click();
  await expect(first.getByRole('checkbox', { name: /^Link cause and effect/ })).toBeChecked();
  await expect(first.getByRole('checkbox', { name: /^Compare like with like/ })).toBeChecked();
  await expect(second.getByText(/No applicable techniques/)).toBeVisible();
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await first.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await testInfo.attach(`technique-editor-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  await second.getByRole('combobox', { name: 'Technique taxonomy' }).selectOption('');
  await page.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const sets = await page.evaluate(
    () =>
      new Promise<QuestionSetRecord[]>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSets', 'readonly');
          const records = transaction.objectStore('questionSets').getAll();
          transaction.oncomplete = () => {
            database.close();
            resolve(records.result);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
  const allocations = sets[0].questions[0].answer!.allocations;
  expect(allocations[0].targetConceptIds).toHaveLength(1);
  expect(allocations[0].techniqueTags).toEqual({
    taxonomyId: 'science-techniques',
    taxonomyVersion: 1,
    techniqueIds: ['causal-link', 'paired-comparison'],
    provenance: { source: 'author' },
  });
  expect(allocations[1]).not.toHaveProperty('techniqueTags');
  expect(allocations[1].targetConceptIds).toEqual([]);
});

test('keeps a generated family’s techniques tied to its source template', async ({ page }) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Family authoring', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  const bank = parseQuestionBank(
    JSON.parse(
      readFileSync(
        new URL('../../docs/question-bank/examples/numeric-family.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  bank.families[0].template.questions[0].answer!.allocations[0].techniqueTags = {
    taxonomyId: 'science-techniques',
    taxonomyVersion: 1,
    techniqueIds: ['substitution'],
    provenance: { source: 'author' },
  };
  await page.getByLabel('Question bank JSON').setInputFiles({
    name: 'family.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bank)),
  });
  await page.getByRole('link', { name: /Density calculation/ }).click();
  await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Shift+F10');
  await page.getByRole('menuitem', { name: 'What it tests', exact: true }).click();
  await expect(
    page.getByText(/edit the source bank and import a higher bank version/),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Technique taxonomy' })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: /^Substitute values/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Substitute values/ })).toBeDisabled();
});
