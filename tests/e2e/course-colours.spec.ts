import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const theme of ['light', 'dark']) {
  test(`course identity colours agree across Today and navigation in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page.evaluate(async (theme) => {
      localStorage.setItem('lacuna-theme', theme);
      await new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('lacuna');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction(
            ['courses', 'lessons', 'cards', 'courseAssessments'],
            'readwrite',
          );
          const courses = tx.objectStore('courses');
          const lessons = tx.objectStore('lessons');
          const cards = tx.objectStore('cards');
          const assessments = tx.objectStore('courseAssessments');
          const original = courses.getAll();
          original.onsuccess = () => {
            courses.clear();
            for (const name of ['Biology', 'History']) {
              courses.put({
                ...original.result[0],
                id: name.toLowerCase(),
                name,
                colour: undefined,
                examDate: undefined,
              });
            }
          };
          const originalAssessments = assessments.getAll();
          originalAssessments.onsuccess = () => {
            const final = originalAssessments.result.find(
              (assessment) => assessment.kind === 'final',
            );
            assessments.clear();
            for (const courseId of ['biology', 'history']) {
              assessments.put({
                ...final,
                id: `${courseId}-final`,
                courseId,
                schedulingMode: 'steady',
                examDate: undefined,
                afterLessonId: `${courseId}-lesson`,
              });
            }
          };
          const originalLessons = lessons.getAll();
          originalLessons.onsuccess = () => {
            lessons.clear();
            for (const id of ['biology', 'history']) {
              lessons.put({ ...originalLessons.result[0], id: `${id}-lesson`, courseId: id });
            }
          };
          const originalCards = cards.getAll();
          originalCards.onsuccess = () => {
            cards.clear();
            for (const [courseId, count] of [
              ['biology', 3],
              ['history', 8],
            ] as const) {
              for (const [index, card] of originalCards.result.slice(0, count).entries()) {
                cards.put({
                  ...card,
                  id: `${courseId}-${index}`,
                  courseId,
                  primaryLessonId: `${courseId}-lesson`,
                  stability: courseId === 'biology' ? 90 : 18,
                  difficulty: 5,
                  lastReviewed: Date.now() - 12 * 86_400_000,
                  state: 2,
                });
              }
            }
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => {
            db.close();
            reject(tx.error);
          };
        };
      });
    }, theme);
    await page.reload();
    const chart = page.getByRole('img', { name: 'Exam-day forecast' });
    await expect(chart).toBeVisible();
    const queue = page.getByRole('region', { name: 'Today, most urgent first' });
    await expect(queue.getByRole('button', { name: 'Biology', exact: true })).toBeVisible();
    await expect(queue.getByRole('button', { name: 'History', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${theme}.png`) });
    const colours: string[] = [];
    for (const name of ['Biology', 'History']) {
      const marker = queue
        .getByRole('button', { name, exact: true })
        .locator('..')
        .locator('span[aria-hidden]')
        .first();
      const colour = await marker.evaluate((el) => getComputedStyle(el).backgroundColor);
      const legend = page
        .getByRole('list', { name: 'Courses' })
        .getByRole('button', { name, exact: true })
        .locator('span[aria-hidden]');
      await expect(legend).toHaveCSS('background-color', colour);
      const icon = page
        .getByRole('navigation', { name: 'Courses' })
        .getByRole('link', { name, exact: true })
        .locator('svg path')
        .last();
      await expect(icon).toHaveCSS('stroke', colour);
      await expect(
        chart.locator(`g[data-course-id="${name.toLowerCase()}"] > path`).first(),
      ).toHaveCSS('stroke', colour);
      colours.push(colour);
    }
    expect(new Set(colours).size).toBe(2);
    expect(errors).toEqual([]);
  });
}
