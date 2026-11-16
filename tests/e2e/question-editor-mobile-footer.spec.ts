import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import type { QuestionConceptSet, QuestionDefinition } from '@lacuna/core/questions/types';
import type { QuestionSetRecord } from '@lacuna/core/questions/questionSetCodec';

async function retainedQuestion(page: Page, name: string) {
  return page.evaluate(
    (name) =>
      new Promise<{
        question: QuestionDefinition;
        concepts: QuestionConceptSet;
        set: QuestionSetRecord;
      }>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction([
            'questions',
            'questionConcepts',
            'questionSets',
          ]);
          transaction.onerror = () => reject(transaction.error);
          transaction.oncomplete = () => database.close();
          const rows = transaction.objectStore('questions').getAll();
          rows.onsuccess = () => {
            const question = rows.result.find((row) => row.name === name) as QuestionDefinition;
            if (!question?.migratedToSetId) {
              reject(new Error(`No migrated Question named ${name}`));
              return;
            }
            const concepts = transaction.objectStore('questionConcepts').get(question.id);
            const set = transaction.objectStore('questionSets').get(question.migratedToSetId);
            set.onsuccess = () => resolve({ question, concepts: concepts.result, set: set.result });
          };
        };
      }),
    name,
  );
}

test('the Question editor footer keeps save and deletion controls reachable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Footer course');
  const courseId = new URL(page.url()).hash.split('/')[2];

  await page.goto(`/#/course/${courseId}/questions/new`);
  await page.getByPlaceholder('Completing the square').fill('Footer question');
  await page.getByPlaceholder('A single piece of knowledge').fill('Footer concept');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Generated family' }).click();
  await page.getByRole('button', { name: 'Create Question' }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/questions$`));

  await page.getByRole('link', { name: /Footer question/ }).click();
  const save = page.getByRole('button', { name: 'Save Question' });
  await expect(save).toBeVisible();

  const footer = save.locator('xpath=ancestor::div[contains(@class,"sticky")][1]');
  await expect(footer).toHaveCSS('position', 'sticky');
  const footerBottom = await footer.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footerBottom).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);

  const remove = page.getByRole('button', { name: 'Delete', exact: true });
  await remove.click({ trial: true });
  await save.click({ trial: true });

  await remove.click();
  // The outgoing trigger can remain mounted while the inline confirmation enters.
  const confirmation = footer
    .getByText('Delete this Question definition? Its attempt evidence will be retained.', {
      exact: true,
    })
    .locator('..');
  const confirm = confirmation.getByRole('button', { name: 'Delete', exact: true });
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await confirm.click({ trial: true });
  await cancel.click({ trial: true });
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Question entry requires a Concept choice and retains it across repeat and edit (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Deliberate Concepts');
    const courseId = new URL(page.url()).hash.split('/')[2];
    const editorUrl = `/#/course/${courseId}/questions/new`;
    const concept = page.getByRole('combobox', { name: /^Primary skill practised/ });
    const name = page.getByPlaceholder('Completing the square');
    const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
    const explanation = page.getByRole('textbox', { name: 'Worked explanation', exact: true });
    const answer = page.getByRole('textbox', { name: 'Expected answer', exact: true });

    // Create the existing Course Concepts through the supported editor controls.
    await page.goto(editorUrl);
    await page.getByPlaceholder('A single piece of knowledge').fill('Another skill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(concept).not.toHaveValue('');
    await page.getByPlaceholder('A single piece of knowledge').fill('Chosen skill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByPlaceholder('A single piece of knowledge')).toHaveValue('');
    const chosenId = await concept.inputValue();
    await expect(concept.locator('option').nth(1)).toHaveText('Another skill');
    const prerequisiteId = await concept.locator('option').nth(1).getAttribute('value');
    await page.getByRole('button', { name: 'Generated family' }).click();
    await name.fill('Existing generated family');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();

    await page.goto(editorUrl);
    await expect(prompt).toBeFocused();
    await expect(concept).toHaveValue('');
    await prompt.fill('What is 2 + 2?');
    await answer.fill('4');
    await explanation.fill('Combine the two pairs.');
    await name.fill('First explicit Question');
    await name.press('Control+Enter');
    await expect(concept).toBeFocused();
    await expect(concept).toHaveAccessibleDescription('Choose the primary skill practised.');
    await expect(prompt).toHaveValue('What is 2 + 2?');
    await concept.selectOption({ label: 'Chosen skill' });
    await page
      .getByRole('combobox', { name: 'Lesson', exact: true })
      .selectOption({ label: 'Lesson 1' });
    const lessonId = await page.getByRole('combobox', { name: 'Lesson', exact: true }).inputValue();
    await page.getByRole('button', { name: 'Another skill', exact: true }).click();
    await page.getByRole('button', { name: 'Save & add another' }).click();
    await expect(prompt).toHaveValue('');
    await expect(prompt).toBeFocused();
    await expect(concept).toHaveValue(chosenId);
    await expect(page.getByRole('combobox', { name: 'Lesson', exact: true })).not.toHaveValue('');
    await expect(page.getByRole('button', { name: 'Another skill', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await prompt.fill('What is 3 + 3?');
    await answer.fill('6');
    await explanation.fill('Combine the two triples.');
    await name.fill('Second explicit Question');
    await name.press('Meta+Enter');
    await expect(prompt).toHaveValue('');
    await expect(concept).toHaveValue(chosenId);
    await page.reload();
    await expect(concept).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Restore draft' })).toHaveCount(0);
    await prompt.press('Escape');
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();

    for (const questionName of ['First explicit Question', 'Second explicit Question']) {
      await page.getByRole('link', { name: new RegExp(questionName) }).click();
      await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
      const composerPrompt = page.getByRole('textbox', { name: 'Q1 question', exact: true });
      await expect(composerPrompt).toHaveValue(
        questionName.startsWith('First') ? 'What is 2 + 2?' : 'What is 3 + 3?',
      );
      await expect(page.getByRole('textbox', { name: 'Q1 mark scheme', exact: true })).toHaveValue(
        questionName.startsWith('First') ? 'Answer: 4.' : 'Answer: 6.',
      );
      const prerequisites = questionName.startsWith('First') ? [prerequisiteId] : [];
      const before = await retainedQuestion(page, questionName);
      expect(before.concepts.targetConceptIds).toEqual([chosenId]);
      expect(before.concepts.prerequisiteConceptIds).toEqual(prerequisites);
      await page.getByRole('button', { name: 'Set details', exact: true }).click();
      await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`${questionName} edited`);
      await page.getByRole('button', { name: 'Close set details', exact: true }).click();
      await composerPrompt.press('Control+Enter');
      await expect(page).toHaveURL(/question-sets\/[^/]+$/);
      const after = await retainedQuestion(page, questionName);
      expect(after.set.title).toBe(`${questionName} edited`);
      expect(after.set.lessonIds).toEqual([lessonId]);
      expect(after.set.questions[0].answer).toMatchObject({
        allocations: [{ targetConceptIds: [chosenId] }],
        prerequisiteConceptIds: prerequisites,
      });
      expect(after.concepts).toEqual(before.concepts);
      await page.goto(`/#/course/${courseId}/questions`);
      await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
    }
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Question validation focuses the answer and invalid generator field (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Question validation');
    const courseId = new URL(page.url()).hash.split('/')[2];
    await page.goto(`/#/course/${courseId}/questions/new`);
    const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
    const answer = page.getByRole('textbox', { name: 'Expected answer', exact: true });
    await prompt.fill('What is 2 + 2?');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(answer).toBeFocused();
    await expect(page.getByText('Add a valid answer.', { exact: true })).toBeVisible();
    await expect(prompt).toHaveValue('What is 2 + 2?');
    await answer.fill('4');
    await answer.press('Control+Enter');
    await expect(
      page.getByRole('textbox', { name: 'Worked explanation', exact: true }),
    ).toBeFocused();

    await page.getByRole('button', { name: 'Generated family' }).click();
    const name = page.getByPlaceholder('Completing the square');
    await name.fill('Validated quadratic family');
    await page.getByPlaceholder('A single piece of knowledge').fill('Quadratic roots');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const minimum = page.getByRole('spinbutton', { name: 'Minimum root magnitude', exact: true });
    await minimum.fill('10');
    await name.press('Meta+Enter');
    await expect(minimum).toBeFocused();
    await expect(minimum).toHaveValue('10');
    await expect(minimum).toHaveAttribute('aria-invalid', 'true');
    await expect(minimum).toHaveAccessibleDescription(
      'Use a minimum root magnitude no greater than the maximum.',
    );
    await expect(name).toHaveValue('Validated quadratic family');
    await minimum.fill('3');
    await expect(minimum).toBeFocused();
    await expect(minimum).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
    await page.getByRole('link', { name: /Validated quadratic family/ }).click();
    await expect(minimum).toHaveValue('3');
    await expect(
      page.getByRole('combobox', { name: 'Primary skill practised', exact: true }),
    ).toHaveValue(/.+/);
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const kind of ['alternative', 'tolerance'] as const) {
    test(`Question save focuses the invalid ${kind} after answer transitions (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      await enterFreshLacuna(page);
      await createCourse(page, 'Numeric focus');
      const courseId = new URL(page.url()).hash.split('/')[2];
      await page.goto(`/#/course/${courseId}/questions/new`);
      const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
      const expected = page.getByRole('textbox', { name: 'Expected answer', exact: true });
      await prompt.fill('Give an accepted value.');
      await expected.fill('4');
      const outgoingId = await expected.getAttribute('id');
      await page
        .getByRole('textbox', { name: 'Worked explanation', exact: true })
        .fill('Use the accepted values.');
      await page.getByPlaceholder('Completing the square').fill('Precise numeric focus');
      await page.getByPlaceholder('A single piece of knowledge').fill('Accepted values');
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page
        .getByRole('button', { name: kind === 'alternative' ? 'One of' : 'Tolerance', exact: true })
        .click();
      if (kind === 'alternative') {
        await page.getByRole('button', { name: 'Add accepted answer' }).click();
      }
      const invalid =
        kind === 'alternative'
          ? page.getByRole('textbox', { name: 'Accepted answer 2', exact: true })
          : page.getByRole('spinbutton', { name: 'Plus or minus', exact: true });
      if (kind === 'tolerance') await invalid.fill('-1');
      // The outgoing input must finish unmounting before the ref is exercised.
      await expect(page.locator(`[id="${outgoingId}"]`)).toHaveCount(0);
      await page.getByRole('button', { name: 'Create Question' }).click();
      await expect(invalid).toBeFocused();
      const inputBounds = (await invalid.boundingBox())!;
      const saveBounds = (await page
        .getByRole('button', { name: 'Create Question' })
        .boundingBox())!;
      expect(inputBounds.y).toBeGreaterThanOrEqual(56);
      expect(inputBounds.y + inputBounds.height).toBeLessThan(saveBounds.y);
      await expect(prompt).toHaveValue('Give an accepted value.');
      await expect(page.getByText('Add a valid answer.', { exact: true })).toBeVisible();
      const primary =
        kind === 'alternative'
          ? page.getByRole('textbox', { name: 'Accepted answer 1', exact: true })
          : expected;
      await expect(primary).toHaveValue('4');
      const draftKey = `lacuna:draft:question:${courseId}:new`;
      await expect
        .poll(() =>
          page.evaluate((key) => {
            const draft = localStorage.getItem(key);
            return draft ? JSON.parse(draft).state.numericAnswer : null;
          }, draftKey),
        )
        .toEqual(
          kind === 'alternative'
            ? { kind: 'matches-one-of', values: ['4', ''] }
            : { kind: 'within', value: '4', tolerance: -1 },
        );
      const unfinishedDraft = await page.evaluate((key) => localStorage.getItem(key)!, draftKey);
      await invalid.fill(kind === 'alternative' ? '5' : '0.1');
      await page.getByRole('button', { name: 'Create Question' }).click();
      await expect(page.getByRole('heading', { name: 'Questions' })).toBeVisible();
      await page.getByRole('link', { name: /Precise numeric focus/ }).click();
      await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
      await expect(page.getByRole('textbox', { name: 'Q1 question', exact: true })).toHaveValue(
        'Give an accepted value.',
      );
      await expect(page.getByRole('textbox', { name: 'Q1 mark scheme', exact: true })).toHaveValue(
        kind === 'alternative' ? 'Answer: 4 or 5.' : 'Answer: 4 within 0.1.',
      );
      const retained = await retainedQuestion(page, 'Precise numeric focus');
      expect(retained.question).toMatchObject({
        payload: {
          kind: 'numeric',
          answer:
            kind === 'alternative'
              ? { kind: 'matches-one-of', values: ['4', '5'] }
              : { kind: 'within', value: '4', tolerance: 0.1 },
        },
      });

      // Replay an unfinished old-form draft from a tab open before migration.
      await page.evaluate(({ key, draft }) => localStorage.setItem(key, draft), {
        key: `lacuna:draft:question:${courseId}:${retained.question.id}`,
        draft: unfinishedDraft,
      });
      await page.reload();
      await page.getByRole('button', { name: 'Restore draft', exact: true }).click();
      await expect(invalid).toHaveValue(kind === 'alternative' ? '' : '-1');
      await expect(primary).toHaveValue('4');
      await expect(prompt).toHaveValue('Give an accepted value.');
      await invalid.fill(kind === 'alternative' ? '5' : '0.1');
      await page.getByRole('button', { name: 'Save Question', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
      await page.getByRole('link', { name: /Precise numeric focus/ }).click();
      await expect(page).toHaveURL(/question-sets\/[^/]+\/edit$/);
      expect((await retainedQuestion(page, 'Precise numeric focus')).question).toMatchObject({
        payload: retained.question.kind === 'fixed' ? retained.question.payload : undefined,
      });
    });
  }
}
