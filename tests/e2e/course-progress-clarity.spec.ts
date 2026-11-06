import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { Card, Course, Lesson } from '@lacuna/core/db/types';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

async function capture(page: Page, info: TestInfo, name: string) {
  await page.mouse.move(0, 0);
  const path = info.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('Course estimates and progress distinguish review evidence from predictions on desktop', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  const [course] = await readAll<Course>(page, 'courses');
  const lessons = (await readAll<Lesson>(page, 'lessons')).filter(
    (lesson) => lesson.courseId === course.id,
  );
  await page.goto(`/#/course/${course.id}`);
  const details = page.getByText('Details', { exact: true }).first();
  await expect(details).toBeVisible();
  await expect(page.getByText(/min remaining/).first()).toBeVisible();
  const assumption = page.getByText(/Counts one attempt per card/).first();
  await expect(assumption).toBeHidden();
  await capture(page, info, 'course-workload-summary');
  await details.click();
  await expect(assumption).toBeVisible();
  await capture(page, info, 'course-workload-details');
  const summary = page.getByRole('region', { name: 'Course summary', exact: true });
  await summary.scrollIntoViewIfNeeded();
  await summary.getByLabel('About progress', { exact: true }).click();
  await expect(summary.getByText(/% secured counts cards meeting it/)).toBeVisible();
  await capture(page, info, 'course-progress-definitions');
  await page
    .getByRole('link', { name: /Study for/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/study\?assessmentId=/);

  await page.goto(`/#/course/${course.id}/analytics`);
  const overview = page.getByRole('region', { name: 'Whole course', exact: true });
  await expect(
    overview.getByRole('img', { name: 'Predicted recall: not assessed yet' }),
  ).toBeVisible();
  for (const label of [
    'Predicted recall',
    'If you stopped now',
    'Due for review',
    'Cards',
    'Reviews, 30 days',
    'Study time, 30 days',
  ]) {
    await expect(overview.getByText(label, { exact: true }).first()).toBeVisible();
  }
  const chart = page.getByRole('region', { name: 'Exam-day forecast', exact: true });
  await expect(chart).toContainText('Not assessed yet');
  await expect(chart.getByText('Behind', { exact: true })).toHaveCount(0);
  await capture(page, info, 'progress-unassessed');
  await overview.getByLabel('About recall', { exact: true }).click();
  await expect(overview.getByText(/Reviewed at least once and no longer new/)).toBeVisible();
  await capture(page, info, 'progress-definitions');

  await page.goto(`/#/course/${course.id}/lesson/${lessons[0].id}`);
  await page.getByLabel('About progress', { exact: true }).click();
  await expect(page.getByText(/Recall can still fall before a test/)).toBeVisible();
  await capture(page, info, 'lesson-progress-definitions');

  const cards = (await readAll<Card>(page, 'cards')).filter((card) => card.courseId === course.id);
  await page.evaluate(async (card) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('cards', 'readwrite');
        transaction.objectStore('cards').put({
          ...card,
          state: 2,
          reps: 1,
          stability: 10,
          difficulty: 5,
          lastReviewed: Date.now() - 86_400_000,
          due: Date.now() + 86_400_000,
        });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, cards[0]);
  await page.goto(`/#/course/${course.id}/analytics`);
  await page.reload();
  await expect(overview.getByText('Not assessed yet', { exact: true })).toHaveCount(0);
  await expect(overview.getByRole('img', { name: /^Predicted recall: \d+%$/ })).toBeVisible();
  await expect(overview.getByText('1 Reviewed', { exact: true })).toBeVisible();
  await capture(page, info, 'progress-with-review-evidence');
});
