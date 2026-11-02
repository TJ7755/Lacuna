import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';
import { parseQuestionBank } from '../../apps/web/src/questions/bank';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('builds a course catalogue in place, tags points separately from knowledge and keeps them through reload and publication', async ({
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
  await page.getByRole('button', { name: /^Q1 techniques/ }).click();
  const card = page.getByRole('dialog', { name: 'Q1 techniques' });
  // A new course starts with no techniques; the card offers the built-ins and a custom one.
  await card.getByRole('button', { name: 'Add Link cause and effect' }).click();
  await card.getByRole('button', { name: 'Add Compare like with like' }).click();
  await card.getByRole('button', { name: '+ Built-in' }).click();
  await card.getByRole('button', { name: '+ New' }).click();
  await card.getByRole('textbox', { name: 'Name' }).fill('Quote the data');
  await card.getByRole('button', { name: 'Create', exact: true }).click();
  const first = card.getByRole('group', { name: 'Point 1 techniques' });
  const second = card.getByRole('group', { name: 'Point 2 techniques' });
  await first.getByRole('button', { name: 'Link cause and effect', exact: true }).click();
  await first.getByRole('button', { name: 'Compare like with like', exact: true }).click();
  await expect(
    first.getByRole('button', { name: 'Link cause and effect', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Knowledge points never feed technique memory, so the card offers the fix in place.
  await expect(card.getByRole('combobox', { name: 'Point 1 tests' })).toHaveAttribute(
    'data-warning',
    'true',
  );
  await card.getByRole('button', { name: 'Count it' }).click();
  // The fix removes its own button; focus stays in the card.
  await expect(card).toBeFocused();
  await expect(card.getByRole('combobox', { name: 'Point 1 tests' })).toHaveValue('exam-execution');
  await card.getByRole('combobox', { name: 'Point 1 tests' }).selectOption('mixed');
  await expect(second.getByRole('button', { name: 'Quote the data', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();
  await expect(page.getByRole('button', { name: /^Q1 techniques/ })).toHaveAccessibleName(
    'Q1 techniques: Link cause and effect, Compare like with like',
  );
  await page.getByRole('button', { name: 'Save set', exact: true }).click();
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const setUrl = page.url();
  await page.goto(`${setUrl}/edit`);
  await page.getByRole('button', { name: /^Q1 techniques/ }).click();
  await expect(
    first.getByRole('button', { name: 'Link cause and effect', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(
    first.getByRole('button', { name: 'Compare like with like', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  // Only the decided point offers Reset; the untouched one shows nothing.
  await expect(card.getByRole('button', { name: 'Reset' })).toHaveCount(1);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await card.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await testInfo.attach(`technique-card-${width}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  await page.keyboard.press('Escape');
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
  expect(allocations[0].dimension).toBe('mixed');
  expect(allocations[0].techniqueTags).toEqual({
    taxonomyId: 'course',
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
  // The legacy tag brings its built-in into the course catalogue without a migration.
  await expect(page.getByRole('button', { name: /^Q1 techniques/ })).toHaveAccessibleName(
    /^Q1 techniques: Substitute values/,
  );
  await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Shift+F10');
  await page.getByRole('menuitem', { name: 'What it tests', exact: true }).click();
  const card = page.getByRole('dialog', { name: 'Q1 techniques' });
  await expect(card.getByText('Set by the source bank')).toBeVisible();
  const chip = card.getByRole('button', { name: 'Substitute values', exact: true }).first();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');
  await expect(chip).toBeDisabled();
  await expect(page.getByRole('region', { name: 'Classify techniques' })).toHaveCount(0);
});

test('classifies undecided points on request, keeps the author’s choices and leaves unsure tags for confirmation', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const evidence = async (name: string) =>
    testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.evaluate(() => {
    localStorage.setItem(
      'lacuna.jevSettings',
      JSON.stringify({ enabled: true, acceptedConsentVersion: 2 }),
    );
    localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
  });
  await page.route('**/api/ai/session', (route) =>
    route.fulfill({ json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 } }),
  );
  const requests: { techniques: { id: string }[]; points: { criterion: string }[] }[] = [];
  await page.route('**/api/ai/jev', async (route) => {
    const body = route.request().postDataJSON();
    requests.push(body);
    await route.fulfill({
      json: {
        model: 'jev-1.14.0',
        inputTokens: 100,
        points: body.points.map((point: { criterion: string }) =>
          /Friction/.test(point.criterion)
            ? { techniqueIds: [], suggestedIds: ['causal-link'] }
            : { techniqueIds: ['causal-link'], suggestedIds: [] },
        ),
      },
    });
  });
  await page.reload();
  await createCourse(page, 'Classification', false);
  const coursePath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${coursePath}/questions`);
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Friction');
  await page.keyboard.press('Enter');
  await page
    .getByRole('textbox', { name: 'Q1 question', exact: true })
    .fill('Explain why the trolley slows down on the carpet.');
  await page
    .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
    .fill('Friction acts opposite to motion\nResultant force backwards, so it decelerates\nNewton');
  const bar = page.getByRole('region', { name: 'Classify techniques' });
  const classify = bar.getByRole('button', { name: 'Classify techniques' });
  await expect(classify).toBeDisabled();
  await expect(bar.getByRole('link', { name: 'Add techniques' })).toBeVisible();

  await page.getByRole('button', { name: /^Q1 techniques/ }).click();
  const card = page.getByRole('dialog', { name: 'Q1 techniques' });
  await evidence('technique-empty-catalogue');
  await card.getByRole('button', { name: 'Add Link cause and effect' }).click();
  // The author decides the third point: no technique. Jev must leave it alone.
  const third = card.getByRole('group', { name: 'Point 3 techniques' });
  await third.getByRole('button', { name: 'Link cause and effect', exact: true }).click();
  await third.getByRole('button', { name: 'Link cause and effect', exact: true }).click();
  await expect(
    card.getByRole('region', { name: /^Point 3:/ }).getByRole('button', { name: 'Reset' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card).toBeHidden();

  await expect(classify).toBeEnabled();
  await classify.click();
  await expect(bar.getByRole('status')).toContainText('1/2 tagged · 1 unsure');
  await evidence('technique-classified');
  expect(requests).toHaveLength(1);
  expect(requests[0]!.points.map((point) => point.criterion)).toEqual([
    'Friction acts opposite to motion',
    'Resultant force backwards, so it decelerates',
  ]);
  expect(requests[0]!.techniques.map((technique) => technique.id)).toEqual(['causal-link']);
  await bar.getByRole('button', { name: 'Count it' }).click();
  await expect(bar.getByText(/not counted/)).toHaveCount(0);

  const trigger = page.getByRole('button', { name: /^Q1 techniques/ });
  await expect(trigger).toHaveAccessibleName(
    'Q1 techniques: Link cause and effect. One point has unsure suggestions to confirm',
  );
  await trigger.click();
  await evidence('technique-unsure-card');
  await card
    .getByRole('group', { name: 'Point 1 techniques' })
    .getByRole('button', { name: 'Confirm Link cause and effect, suggested by Jev' })
    .click();
  await expect(trigger).toHaveAccessibleName(
    'Q1 techniques: Link cause and effect. One point tests Knowledge, so its techniques do not count',
  );
  await page.keyboard.press('Escape');
  // The summary follows the set as it stands, including choices made since the run.
  await expect(bar.getByRole('status')).toContainText('2/2 tagged · 1 not counted');
});
