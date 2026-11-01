import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test';
import type { Lesson } from '../../apps/web/src/db/types';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

const DAY_MS = 86_400_000;

async function openCourseProgress(page: Page) {
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const courseId = new URL(page.url()).hash.split('/')[2];
  const [first] = (await readAll<Lesson>(page, 'lessons'))
    .filter((lesson) => lesson.courseId === courseId && !lesson.isExtension)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const now = Date.now();
  // A pupil-owned topic test over the first lesson, nearer than the course's final exam.
  await page.evaluate(
    async (row) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('courseAssessments', 'readwrite');
          transaction.objectStore('courseAssessments').put(row);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => reject(transaction.error);
        };
      }),
    {
      id: 'topic-test',
      courseId,
      name: 'Topic test',
      kind: 'checkpoint',
      examDate: now + 5 * DAY_MS,
      coverageMode: 'custom',
      lessonIds: [first.id],
      afterLessonId: null,
      excludedCardIds: [],
      createdAt: now,
      updatedAt: now,
    },
  );
  await page.goto(`/#/course/${courseId}/analytics`);
  await page.reload();
  return courseId;
}

async function capture(page: Page, testInfo: TestInfo, name: string, region?: Locator) {
  await page.mouse.move(0, 0);
  const path = testInfo.outputPath(`${name}.png`);
  // The app scrolls inside its own frame, so cards below the fold are captured on their own.
  await (region ?? page).screenshot({ path, animations: 'disabled', fullPage: !region });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'phone', width: 390, height: 844 },
]) {
  test(`Progress scopes coverage, recall and next step to a topic test on ${viewport.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const courseId = await openCourseProgress(page);

    const whole = page.getByRole('region', { name: 'Whole course' });
    await expect(whole).toBeVisible();
    await expect(whole.getByRole('img', { name: /^Cards: \d+$/ })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Lessons' }).getByRole('listitem').first(),
    ).toBeVisible();
    // The topic test and the rest of the course fall on different dates: one row per paper.
    const papers = page.getByRole('region', { name: 'Forecast by paper' });
    await expect(papers.getByRole('button', { name: 'Show Topic test' })).toBeVisible();
    await expect(papers).toContainText('in total, matching the headline.');
    await capture(page, testInfo, `${viewport.name}-whole-course`);
    await capture(page, testInfo, `${viewport.name}-forecast-by-paper`, papers);

    await page.getByLabel('Show', { exact: true }).selectOption('topic-test');
    await expect(page).toHaveURL(/assessment=topic-test/);
    const scoped = page.getByRole('region', { name: 'Topic test' });
    await expect(scoped).toContainText('(in 5 days) if you stop reviewing now.');
    await expect(page.getByRole('heading', { name: 'Exam-day forecast' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Forecast by paper' })).toHaveCount(0);
    const evidence = page.getByRole('region', { name: 'Questions' });
    await expect(evidence.getByRole('img', { name: /marked answers$/ })).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
    await capture(page, testInfo, `${viewport.name}-topic-test`);
    await capture(page, testInfo, `${viewport.name}-question-evidence`, evidence);

    // The scope survives a reload because it lives in the URL.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Topic test' })).toBeVisible();

    await page
      .getByRole('region', { name: 'Topic test' })
      .getByRole('button', { name: 'Revise for Topic test' })
      .click();
    await expect(page).toHaveURL(
      new RegExp(`#/course/${courseId}/study\\?assessmentId=topic-test`),
    );
  });
}
