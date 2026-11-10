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
  test(`keeps scheduled reviews and assessment practice in one card activity (exam: ${exam})`, async ({
    page,
  }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    if (exam) await page.route('**/api/ai/**', (route) => route.abort());
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
        if (exam) {
          localStorage.setItem(
            'lacuna.jevSettings',
            JSON.stringify({ enabled: true, acceptedConsentVersion: 2 }),
          );
          localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
        } else {
          localStorage.setItem('lacuna.studyMode', 'simple');
        }
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(
              ['cards', 'courses', 'courseAssessments', 'lessons', 'lessonCompletions'],
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
                ...(exam
                  ? ([
                      ['review-later', 'Later review', now + 1_800_000, 1e8],
                      ['review-later-extra', 'Another later review', now + 1_800_000, 1e8],
                    ] as const)
                  : []),
              ] as const) {
                cards.put({
                  ...template,
                  id,
                  front,
                  primaryLessonId: exam && id === 'review-future' ? template.primaryLessonId : null,
                  answerMode: exam && id === 'review-due' ? 'type' : template.answerMode,
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
              const courses = transaction.objectStore('courses');
              const course = courses.get(courseId);
              course.onsuccess = () => courses.put({ ...course.result, learnFirst: false });
              const assessments = transaction.objectStore('courseAssessments');
              const rows = assessments.index('courseId').getAll(courseId);
              rows.onsuccess = () => {
                for (const assessment of rows.result) {
                  if (assessment.kind === 'final')
                    assessments.put({
                      ...assessment,
                      name: 'Steady retention',
                      schedulingMode: 'exam',
                      examDate: now + 7 * day, // Inside the default early-practice window.
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
      'Card practice',
    );
    await preview.getByRole('button', { name: 'Start session' }).click();
    await expect(page.locator('[data-study-card-id="review-due"]:not([inert])')).toBeVisible();
    const title = page.getByRole('heading', { name: 'Card practice', exact: true });
    await expect(title).toBeVisible();
    const progress = page.getByRole('progressbar', { name: 'Session progress' });
    const segments = progress.locator('[data-session-card-status]');
    await expect(progress).toHaveAttribute('aria-valuetext', '0 of 1 review complete');
    await expect(segments).toHaveCount(1);
    if (exam) {
      await page.getByRole('textbox', { name: 'Your answer' }).fill('Answer');
      await page.getByRole('button', { name: 'Check answer' }).click();
      await expect(progress).toHaveAttribute('aria-valuetext', '1 of 1 review complete');
      await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeEnabled();
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
      await expect(page.getByRole('main', { name: 'Session report' })).toHaveCount(0);

      await expect(page.locator('[data-study-card-id="review-future"]:not([inert])')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
      await expect(title).toBeVisible();
      await expect(progress).toHaveAttribute('aria-valuetext', '0 of 1 review complete');
      // Make two more cards due while the assessment block is open.
      await page.evaluate(
        () =>
          new Promise<void>((resolve, reject) => {
            const open = indexedDB.open('lacuna');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const database = open.result;
              const transaction = database.transaction('cards', 'readwrite');
              transaction.oncomplete = () => {
                database.close();
                resolve();
              };
              transaction.onerror = () => {
                database.close();
                reject(transaction.error);
              };
              const cards = transaction.objectStore('cards');
              for (const id of ['review-later', 'review-later-extra']) {
                const later = cards.get(id);
                later.onsuccess = () => cards.put({ ...later.result, due: Date.now() - 1 });
              }
            };
          }),
      );
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              new Promise<string[]>((resolve, reject) => {
                const request = indexedDB.open('lacuna');
                request.onerror = () => reject(request.error);
                request.onsuccess = () => {
                  const database = request.result;
                  const reviews = database
                    .transaction('reviewHistory')
                    .objectStore('reviewHistory')
                    .index('cardId')
                    .getAll('review-future');
                  reviews.onsuccess = () => {
                    database.close();
                    resolve(reviews.result.map((review) => review.sessionKind));
                  };
                  reviews.onerror = () => {
                    database.close();
                    reject(reviews.error);
                  };
                };
              }),
          ),
        )
        .toEqual(['assessment-revision']);
      await expect(page.locator('[data-study-card-id^="review-later"]:not([inert])')).toBeVisible();
      await expect(title).toBeVisible();
      await expect(progress).toHaveAttribute('aria-valuetext', '0 of 2 reviews complete');
      await expect(segments).toHaveCount(2);
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await expect(progress).toHaveAttribute('aria-valuetext', '1 of 2 reviews complete');
      await expect(segments.first()).toHaveAttribute('data-session-card-status', 'correct');
      await expect(segments.last()).toHaveAttribute('data-session-card-status', 'current');
      await page.screenshot({ path: testInfo.outputPath('quiet-card-practice.png') });
      await expect(page.getByRole('button', { name: 'Continue', exact: true })).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();

    await expect(page.getByRole('button', { name: 'Finish for now' })).toBeVisible();
    await page.getByRole('button', { name: 'Finish for now' }).click();
    await expect(page.getByLabel('Today: 0 reviews due')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('dashboard-nothing-due.png') });
    if (!exam) {
      await expect(page.getByRole('button', { name: 'Study Biology' })).toHaveCount(0);
      await expect(page.getByText('Done for today')).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
