import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';
import type { Lesson } from '@lacuna/core/db/types';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

test('Today and course show a read-only workload estimate and a calm budget warning', async ({
  page,
}, testInfo) => {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const courseId = new URL(page.url()).hash.split('/')[2];
  const lessonIds = (await readAll<Lesson>(page, 'lessons'))
    .filter((lesson) => lesson.courseId === courseId)
    .map((lesson) => lesson.id);
  await page.evaluate(
    async ({ id, lessonIds }) => {
      const now = Date.now();
      const deadline = now + 3 * 86_400_000;
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['courseAssessments', 'revisionPlans'],
            'readwrite',
          );
          transaction.objectStore('courseAssessments').put({
            id: 'workload-paper',
            courseId: id,
            name: 'Upcoming assessment',
            kind: 'checkpoint',
            examDate: deadline,
            timeZone: 'UTC',
            afterLessonId: null,
            coverageMode: 'custom',
            lessonIds,
            excludedCardIds: [],
            createdAt: now,
            updatedAt: now,
          });
          transaction.objectStore('revisionPlans').put({
            id: 'workload-plan',
            assessmentId: 'workload-paper',
            courseId: id,
            status: 'active',
            revision: 1,
            input: { deadlineAt: deadline, timeZone: 'UTC' },
            windows: [],
            completedSessions: [],
            replans: [],
            cardStates: [],
            scope: {},
            createdAt: now,
            updatedAt: now,
          });
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    },
    { id: courseId, lessonIds },
  );
  for (const [name, route] of [
    ['course', `/#/course/${courseId}`],
    ['today', '/#/'],
  ] as const) {
    await page.goto(route);
    await page.reload();
    const estimate = page.getByLabel('Estimated assessment workload');
    await expect(estimate).toContainText('Upcoming assessment: estimated remaining work');
    await expect(estimate).toContainText('Estimated workload coverage: 0%');
    await expect(estimate).toContainText('Your current pace may leave some work unfinished.');
    await expect(estimate).toContainText('An estimate, not a guarantee of recall.');
    await expect(estimate).toContainText('Mean predicted exam recall: 0%');
    await expect(estimate).toContainText('30 of 30 cards below the 90% reference target.');
    await expect(estimate).toContainText(
      'Allows one review only when already due before the assessment',
    );
    await estimate.scrollIntoViewIfNeeded();
    const path = testInfo.outputPath(`${name}-remaining-work-desktop.png`);
    await page.screenshot({ path, animations: 'disabled' });
    await testInfo.attach(`${name} desktop`, { path, contentType: 'image/png' });
  }
});
