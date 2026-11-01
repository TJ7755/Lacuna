import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { CourseAssessment, Lesson } from '../../apps/web/src/db/types';
import type { Concept } from '../../apps/web/src/questions/types';
import type { QuestionSet } from '../../apps/web/src/questions/questionSets';
import type { QuestionSetAttemptRecord } from '../../apps/web/src/questions/questionSetAttempts';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

const MEMBRANE_ANSWER =
  'Damage to the membrane reduces its control over which substances enter and leave the cell.';

async function seedQuestion(page: Page, courseId: string) {
  const now = Date.now();
  const concept: Concept = {
    id: 'membrane-concept',
    scope: 'course',
    scopeKey: `course:${courseId}`,
    courseId,
    name: 'Cell membranes',
    provisional: false,
    createdAt: now,
    updatedAt: now,
  };
  const content: QuestionSet = {
    id: 'membrane-set',
    courseId,
    title: 'Membrane application',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'membrane',
        prompt: 'Explain how damage to the cell membrane affects movement into and out of a cell.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'permeability',
              criterion:
                'Links membrane damage to loss of control over movement into and out of the cell.',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [concept.id],
              techniqueTags: {
                taxonomyId: 'science-techniques',
                taxonomyVersion: 1,
                techniqueIds: ['causal-link'],
                provenance: { source: 'author' },
              },
            },
          ],
        },
      },
    ],
  };
  // Only authored content is seeded. The Study UI owns all attempt and marking writes.
  await page.evaluate(
    ({ concept, set }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(['concepts', 'questionSets'], 'readwrite');
          transaction.objectStore('concepts').add(concept);
          transaction.objectStore('questionSets').add(set);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    {
      concept,
      set: {
        ...content,
        contentVersion: 1,
        contentRevisionId: 'membrane-revision',
        createdAt: now,
        updatedAt: now,
      },
    },
  );
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  for (const width of [1440, 390]) {
    test(`one Study entry resumes and completes manual question practice at ${width}px with ${reducedMotion} motion`, async ({
      page,
    }, testInfo) => {
      const hasExam = width === 1440 && reducedMotion === 'no-preference';
      // The shared course-creation fixture checks the desktop navigation link.
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.emulateMedia({ reducedMotion });
      await enterFreshLacuna(page);
      const courseUrl = await createCourse(page, 'Unified biology study', false);
      const courseId = new URL(courseUrl).hash.split('/')[2];
      await seedQuestion(page, courseId);
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();

      const assessments = page.getByRole('region', { name: 'Assessments', exact: true });
      await assessments.getByRole('button', { name: 'Add test', exact: true }).click();
      const addTest = page.getByRole('dialog', { name: 'Add test', exact: true });
      await addTest.getByRole('textbox', { name: 'Name', exact: true }).fill('Weekly biology test');
      await addTest.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(addTest.getByRole('alert')).toContainText('at least one lesson');
      await addTest.getByRole('button', { name: 'Lesson 1', exact: true }).click();
      await addTest.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(addTest).toBeHidden();
      const [lesson] = await readAll<Lesson>(page, 'lessons');
      await expect
        .poll(async () =>
          (await readAll<CourseAssessment>(page, 'courseAssessments')).find(
            (assessment) => assessment.name === 'Weekly biology test',
          ),
        )
        .toMatchObject({ coverageMode: 'custom', lessonIds: [lesson.id] });

      await assessments
        .locator('button[data-path-row]')
        .filter({ hasText: 'Weekly biology test' })
        .click();
      const editTest = page.getByRole('dialog', { name: 'Edit checkpoint', exact: true });
      await expect(editTest.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(
        'Weekly biology test',
      );
      await editTest
        .getByRole('textbox', { name: 'Name', exact: true })
        .fill('Friday biology test');
      await capture(page, testInfo, `assessment-edit-${width}`);
      await editTest.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(editTest).toBeHidden();
      await expect(
        assessments.locator('button[data-path-row]').filter({ hasText: 'Friday biology test' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Revise for / })).toHaveCount(0);
      await expect(page).toHaveURL(courseUrl);

      if (!hasExam) {
        await assessments
          .locator('button[data-path-row]')
          .filter({ hasText: 'Friday biology test' })
          .click();
        await editTest.getByRole('button', { name: 'Delete', exact: true }).click();
        await page
          .getByRole('dialog', { name: 'Delete', exact: true })
          .getByRole('button', { name: 'Delete', exact: true })
          .click();
        await expect(editTest).toBeHidden();
        await expect
          .poll(
            async () =>
              (await readAll<CourseAssessment>(page, 'courseAssessments')).filter(
                (assessment) => assessment.examDate !== undefined,
              ).length,
          )
          .toBe(0);
      }

      const study = page.getByRole('button', { name: 'Study', exact: true });
      await expect(study).toHaveCount(1);
      await study.click();
      const preview = page.getByRole('region', { name: 'Session preview', exact: true });
      await expect(preview.getByText('Lesson 1', { exact: true })).toBeVisible();
      await capture(page, testInfo, `first-study-preview-${width}`);
      await preview.getByRole('button', { name: 'Start session', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Lesson 1', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page
        .getByRole('main', { name: 'Study progress', exact: true })
        .getByRole('button', { name: 'Finish for now', exact: true })
        .click();
      await expect(page).toHaveURL(courseUrl);
      await study.click();
      await expect(preview.getByText('Practise: Cell membranes', { exact: true })).toBeVisible();
      await expect(
        preview.getByRole('list', { name: "Today's session" }).getByRole('listitem'),
      ).toHaveCount(1);
      const otherWays = preview.getByRole('button', { name: 'Other ways', exact: true });
      await expect(otherWays).toHaveAttribute('aria-expanded', 'false');
      await otherWays.click();
      await expect(otherWays).toHaveAttribute('aria-expanded', 'true');
      await expect(
        preview.getByRole('button', { name: 'Choose exam questions', exact: true }),
      ).toBeVisible();
      await preview.getByRole('button', { name: 'Choose exam questions', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/questions$`));
      await expect(page.getByRole('heading', { name: 'Questions', exact: true })).toBeVisible();
      await expect(preview).toBeHidden();
      await expect(page.getByTestId('study-cover')).toBeHidden();
      const search = page.getByRole('searchbox', { name: 'Search sets', exact: true });
      await search.click();
      await expect(search).toBeFocused();
      await expect(
        page.getByRole('heading', { name: 'Membrane application', exact: true }),
      ).toBeVisible();

      await page.goto(courseUrl);
      await study.click();
      await expect(preview.getByText('Practise: Cell membranes', { exact: true })).toBeVisible();
      await expect(otherWays).toHaveAttribute('aria-expanded', 'false');
      await capture(page, testInfo, `study-preview-${width}`);
      await preview.getByRole('button', { name: 'Start session', exact: true }).click();
      const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
      await expect(answer).toBeVisible();
      await expect(page.getByTestId('study-cover')).toBeHidden();
      await answer.click();
      await expect(answer).toBeFocused();
      await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/study$`));
      await expect(
        page.getByRole('heading', { name: 'Time available today', exact: true }),
      ).toHaveCount(0);
      await answer.fill(MEMBRANE_ANSWER);
      await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
      await expect(page).toHaveURL(courseUrl);

      await study.click();
      await expect(preview.getByText('Resume: Cell membranes', { exact: true })).toBeVisible();
      await preview.getByRole('button', { name: 'Start session', exact: true }).click();
      await expect(answer).toHaveValue(MEMBRANE_ANSWER);
      await expect(page.getByTestId('study-cover')).toBeHidden();
      await answer.click();
      await expect(answer).toBeFocused();
      expect(await readAll(page, 'questionSetAttempts')).toHaveLength(1);
      await capture(page, testInfo, `embedded-question-${width}`);
      await page.getByRole('button', { name: 'Submit question', exact: true }).click();
      await expect(page.getByRole('radio', { name: '1 / 1', exact: true })).toBeEnabled();
      const finish = page.getByRole('button', { name: 'Finish attempt', exact: true });
      await expect(finish).toBeDisabled();
      const fullMark = page.getByRole('radio', { name: '1 / 1', exact: true });
      await fullMark.focus();
      await fullMark.press('Space');
      await expect(fullMark).toBeChecked();
      await expect(finish).toBeEnabled();
      await capture(page, testInfo, `manual-marking-${width}`);
      await finish.click();
      await expect
        .poll(
          async () =>
            (await readAll<QuestionSetAttemptRecord>(page, 'questionSetAttempts'))[0]?.status,
        )
        .toBe('complete');

      const handoff = page.getByRole('main', { name: 'Study progress', exact: true });
      await expect(handoff).toBeVisible();
      await expect(handoff.getByRole('img', { name: '1 of 1 marks', exact: true })).toBeVisible();
      await expect(handoff.getByText(/Self-marked|recalled/)).toHaveCount(0);
      const progress = handoff.getByRole('region', {
        name: 'Progress and priorities',
        exact: true,
      });
      await expect(progress).toBeVisible();
      if (hasExam) {
        await expect(
          progress.getByRole('heading', { name: 'Friday biology test', exact: true }),
        ).toBeVisible();
        await expect(progress.getByText('days to go', { exact: true })).toBeVisible();
        // A cardless assessment has no forecast, so no gauge is drawn.
        await expect(progress.getByRole('progressbar')).toHaveCount(0);
        await expect(progress.getByText(/recall data/)).toHaveCount(0);
      } else {
        await expect(progress.getByText(/^cards? due$/)).toBeVisible();
      }
      await capture(page, testInfo, `study-progress-${width}`);
      await handoff.getByRole('button', { name: 'Finish for now', exact: true }).click();
      await expect(page).toHaveURL(courseUrl);
      await page.reload();
      const [complete] = await readAll<QuestionSetAttemptRecord>(page, 'questionSetAttempts');
      expect(complete).toMatchObject({
        status: 'complete',
        decisions: [{ allocationId: 'permeability', status: 'awarded', marks: 1 }],
        firstMarking: [
          {
            questionId: 'membrane',
            decisions: [{ allocationId: 'permeability', status: 'awarded', marks: 1 }],
          },
        ],
      });
      expect(complete.jevAssessmentReceipts ?? []).toHaveLength(0);
      expect(await readAll(page, 'cards')).toHaveLength(0);
      expect(await readAll(page, 'reviewHistory')).toHaveLength(0);
      expect(await readAll(page, 'sessionHistory')).toHaveLength(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
