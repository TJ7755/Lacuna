import { expect, test } from '@playwright/test';
import { createCourse, enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const width of [320, 390]) {
  test(`keeps course names usable with nothing due at ${width}px and Larger text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      localStorage.setItem('lacuna-font-scale', '1.3');
      localStorage.setItem('lacuna-font-scale-user-set', '1');
    });
    await enterWithWelcomeCourse(page);
    const title = page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true });
    await expect(title).toBeVisible();
    expect((await title.boundingBox())!.width).toBeGreaterThan(100);
    await title.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('nothing-due-narrow.png') });
    await title.click();
    await expect(page).toHaveURL(/#\/course\//);
  });
}

for (const exam of [false, true]) {
  test(`recommends due reviews then early exam preparation (exam: ${exam})`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterWithWelcomeCourse(page);
    await createCourse(page, 'Biology');
    const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front' }).fill('Template');
    await page.getByRole('textbox', { name: 'Back' }).fill('Answer');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);

    await page.evaluate(
      async ({ courseId, exam }) => {
        localStorage.setItem('lacuna.studyMode', 'simple');
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ['cards', 'courseAssessments', 'lessons', 'lessonCompletions'],
              'readwrite',
            );
            transaction.oncomplete = () => {
              database.close();
              resolve();
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            const now = Date.now();
            const day = 86_400_000;
            const cards = transaction.objectStore('cards');
            const templates = cards.index('courseId').getAll(courseId);
            templates.onsuccess = () => {
              const template = templates.result[0];
              cards.delete(template.id);
              for (const [id, front, due, stability] of [
                ['review-due', 'Due card', now - 1, 1e8],
                ['review-future', 'Future weak card', now + day, 0.5],
              ] as const) {
                cards.put({
                  ...template,
                  id,
                  front,
                  primaryLessonId: null,
                  state: 2,
                  due,
                  stability,
                  lastReviewed: now - day,
                  reps: 3,
                });
              }
            };
            const lessons = transaction.objectStore('lessons').index('courseId').getAll(courseId);
            lessons.onsuccess = () => {
              for (const lesson of lessons.result)
                transaction
                  .objectStore('lessonCompletions')
                  .put({ lessonId: lesson.id, completedAt: now, updatedAt: now });
            };
            if (exam) {
              const assessments = transaction.objectStore('courseAssessments');
              const rows = assessments.index('courseId').getAll(courseId);
              rows.onsuccess = () => {
                for (const assessment of rows.result) {
                  if (assessment.kind === 'final')
                    assessments.put({
                      ...assessment,
                      name: 'Biology exam',
                      schedulingMode: 'exam',
                      examDate: now + 30 * day,
                      timeZone: 'UTC',
                    });
                }
              };
            }
          };
        });
      },
      { courseId, exam },
    );

    await page.goto('/#/');
    await page.reload();
    await expect(page.getByLabel('Today: 1 review due, about 1 minute')).toBeVisible();
    await page.getByRole('button', { name: 'Study Biology' }).click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await expect(preview.getByRole('list', { name: "Today's session" })).toHaveText(
      'Review due cards1 card available · up to 10 reviews',
    );
    await preview.getByRole('button', { name: 'Start session' }).click();
    await expect(page.locator('[data-study-card-id="review-due"]:not([inert])')).toBeVisible();
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Finish for now' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish for now' }).click();
    await expect(page.getByLabel('Today: 0 reviews due')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('dashboard-nothing-due.png') });

    if (exam) {
      await page.getByRole('button', { name: 'Study Biology' }).click();
      const recommendation = preview.getByRole('list', { name: "Today's session" });
      await expect(recommendation.getByRole('listitem')).toHaveCount(1);
      await expect(recommendation).toHaveText(
        'Practise for exam1 card available · up to 10 reviews',
      );
      await page.screenshot({ path: testInfo.outputPath('early-exam-preparation.png') });
      await preview.getByRole('button', { name: 'Other ways', exact: true }).click();
      await expect(
        preview.getByRole('button', { name: 'Practise for exam', exact: true }),
      ).toBeVisible();
      await preview.getByRole('button', { name: 'Start session', exact: true }).click();
      await expect(page).toHaveURL(/#\/course\/[^/]+\/study$/);
      await expect(page.locator('[data-study-card-id="review-future"]:not([inert])')).toBeVisible();
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<number>((resolve, reject) => {
                const request = indexedDB.open('lacuna');
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const database = request.result;
                  const count = database
                    .transaction('reviewHistory')
                    .objectStore('reviewHistory')
                    .index('cardId')
                    .count('review-future');
                  count.onsuccess = () => {
                    database.close();
                    resolve(count.result);
                  };
                  count.onerror = () => {
                    database.close();
                    reject(count.error);
                  };
                };
              }),
          ),
        )
        .toBe(1);
    } else {
      await expect(page.getByRole('button', { name: 'Study Biology' })).toHaveCount(0);
      await expect(page.getByText('Done for today')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
