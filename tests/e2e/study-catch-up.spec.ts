import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type {
  Card,
  CourseRecord,
  Lesson,
  LessonCardExposure,
  LessonCompletion,
} from '@lacuna/core/db/types';
import type { ReviewHistoryEntry } from '@lacuna/core/db/reviewHistory';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { addLessonCard, readAll } from './fixtures/syncConvergence';

async function seedMidCourseEntry(page: Page, courseId: string, earlier: Card) {
  const [course] = await readAll<CourseRecord>(page, 'courses');
  const now = Date.now();
  const current: Lesson = {
    id: 'class-current-lesson',
    courseId,
    name: 'Current class lesson',
    orderIndex: 1,
    isExtension: false,
    createdAt: now,
    updatedAt: now,
  };
  const question: QuestionSet = {
    id: 'competing-question',
    courseId,
    title: 'Apply earlier knowledge',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'membrane-question',
        prompt: 'Explain how membrane damage affects movement into a cell.',
        parts: [],
        answer: {
          maxMarks: 1,
          response: { kind: 'written' },
          prerequisiteConceptIds: [],
          allocations: [
            {
              id: 'application',
              criterion: 'Links membrane damage to loss of control over movement.',
              maxMarks: 1,
              dimension: 'application',
              targetConceptIds: [earlier.conceptId],
            },
          ],
        },
      },
    ],
  };
  // Seed authoring and the entry preference only. Study owns every evidence write.
  await page.evaluate(
    ({ course, current, question, earlierLessonId, now }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['courses', 'lessons', 'questionSets'],
            'readwrite',
          );
          transaction.objectStore('courses').put({
            ...course,
            studyStartLessonId: current.id,
            schoolCoveredLessonIds: [earlierLessonId],
            unlockMode: 'semi-linear',
            lessonViewMode: 'study',
            updatedAt: now,
          });
          transaction.objectStore('lessons').add(current);
          transaction.objectStore('questionSets').add({
            ...question,
            contentVersion: 1,
            contentRevisionId: 'authored-catch-up-question',
            createdAt: now,
            updatedAt: now,
          });
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
    { course, current, question, earlierLessonId: earlier.primaryLessonId, now },
  );
  return current;
}

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('desktop Study starts at the current lesson and introduces earlier cards before independent Questions', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await enterFreshLacuna(page);
  const courseUrl = await createCourse(page, 'Mid-course biology', false);
  const courseId = new URL(courseUrl).hash.split('/')[2];
  await addLessonCard(page, courseId, 'Recall the membrane function');
  const [earlier] = await readAll<Card>(page, 'cards');
  const current = await seedMidCourseEntry(page, courseId, earlier);
  await page.goto(courseUrl);
  await page.reload();

  const study = page.getByRole('button', { name: 'Study', exact: true });
  const preview = page.getByRole('region', { name: 'Session preview', exact: true });
  await study.click();
  await expect(preview.getByText(current.name, { exact: true })).toBeVisible();
  await preview.getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page.getByRole('heading', { name: current.name, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const handoff = page.getByRole('main', { name: 'Study progress', exact: true });
  await expect(handoff.getByRole('heading', { name: 'Card practice', exact: true })).toBeVisible();
  await handoff.getByRole('button', { name: 'Finish for now', exact: true }).click();
  await expect(page).toHaveURL(courseUrl);
  expect(await readAll(page, 'reviewHistory')).toHaveLength(0);
  expect(await readAll<LessonCompletion>(page, 'lessonCompletions')).toMatchObject([
    { lessonId: current.id },
  ]);

  await study.click();
  await expect(preview.getByText('Card practice', { exact: true })).toBeVisible();
  await capture(page, info, 'study-preview-earlier-material');
  await preview.getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page.locator(`[data-study-card-id="${earlier.id}"]`)).toBeVisible();
  await expect(
    page.locator('[data-study-face="front"]').getByText(earlier.front, { exact: true }),
  ).toBeVisible();
  await capture(page, info, 'earlier-card-in-fsrs-practice');
  expect(await readAll(page, 'questionSetAttempts')).toHaveLength(0);
  // Record inserted reports, including ones removed before a locator could see them.
  // Completing an embedded step should hand off directly to the next planned step.
  await page.evaluate(() => {
    const reports: string[] = [];
    document.documentElement.dataset.sessionReports = JSON.stringify(reports);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const report = node.matches('main[aria-label="Session report"]')
            ? node
            : node.querySelector('main[aria-label="Session report"]');
          if (report) reports.push(report.querySelector('h1')?.textContent ?? 'Session report');
        }
      }
      document.documentElement.dataset.sessionReports = JSON.stringify(reports);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(handoff.getByRole('heading', { name: /^Practise:/ })).toBeVisible();
  expect(
    await page.evaluate(() => JSON.parse(document.documentElement.dataset.sessionReports ?? '[]')),
  ).toEqual([]);
  await capture(page, info, 'catch-up-direct-practice-handoff');
  await expect
    .poll(() => readAll<ReviewHistoryEntry>(page, 'reviewHistory'))
    .toMatchObject([
      { cardId: earlier.id, correct: true, sessionKind: 'practice', stabilityBefore: null },
    ]);
  const reviewed = (await readAll<Card>(page, 'cards')).find((card) => card.id === earlier.id)!;
  expect(reviewed.reps).toBe(1);
  expect(reviewed.stability).toBeGreaterThan(0);
  expect(reviewed.lastReviewed).not.toBeNull();
  expect(reviewed.due).toBeGreaterThanOrEqual(reviewed.lastReviewed!);
  expect(await readAll<LessonCompletion>(page, 'lessonCompletions')).not.toContainEqual(
    expect.objectContaining({ lessonId: earlier.primaryLessonId }),
  );
  expect(await readAll<LessonCardExposure>(page, 'lessonCardExposures')).not.toContainEqual(
    expect.objectContaining({ lessonId: earlier.primaryLessonId }),
  );

  // The authored Question is genuinely selectable: it was competing with catch-up.
  await page.goto(courseUrl);
  await study.click();
  await expect(preview.getByText(/^Practise:/)).toBeVisible();
  await preview.getByRole('button', { name: 'Start session', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeVisible();
});
