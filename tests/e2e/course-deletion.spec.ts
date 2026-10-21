import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function seedReviewHistory(page: Page, courseId: string) {
  await page.evaluate(async (courseId) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction(
          ['cards', 'reviewHistory', 'reviewActivity'],
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
        const cards = transaction.objectStore('cards').index('courseId').getAll(courseId);
        cards.onsuccess = () => {
          const card = cards.result[0];
          const timestamps = Array.from({ length: 201 }, (_, index) => Date.now() - index * 1000);
          for (const [index, timestamp] of timestamps.entries()) {
            transaction.objectStore('reviewHistory').put({
              id: `review-${index}`,
              cardId: card.id,
              courseId,
              timestamp,
              grade: 3,
              responseTimeSec: 1,
              distracted: false,
              stabilityBefore: null,
              stabilityAfter: 1,
              difficultyBefore: null,
              difficultyAfter: 5,
              retrievabilityAtReview: null,
            });
          }
          transaction.objectStore('reviewActivity').put({ cardId: card.id, timestamps });
        };
      };
    });
  }, courseId);
}

async function courseRowCounts(page: Page, courseId: string) {
  return page.evaluate(async (courseId) => {
    return new Promise<number[]>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction([
          'courses',
          'cards',
          'reviewHistory',
          'reviewActivity',
        ]);
        const counts: number[] = [];
        transaction.oncomplete = () => {
          database.close();
          resolve(counts);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error);
        };
        const requests = [
          transaction.objectStore('courses').count(courseId),
          transaction.objectStore('cards').index('courseId').count(courseId),
          transaction.objectStore('reviewHistory').index('courseId').count(courseId),
          transaction.objectStore('reviewActivity').count(),
        ];
        requests.forEach((query, index) => {
          query.onsuccess = () => {
            counts[index] = query.result;
          };
        });
      };
    });
  }, courseId);
}

for (const reviewed of [false, true]) {
  test(`deletes a course and restores it with Undo (reviewed: ${reviewed})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await createCourse(page, 'Biology');
    const courseUrl = page.url();
    const courseId = /#\/course\/([^/]+)/.exec(courseUrl)![1];
    if (reviewed) {
      await page.getByRole('button', { name: 'Edit mode' }).click();
      await page.getByRole('button', { name: 'New card', exact: true }).first().click();
      await page.getByRole('textbox', { name: 'Front' }).fill('Question');
      await page.getByRole('textbox', { name: 'Back' }).fill('Answer');
      await page.getByRole('button', { name: 'Add card', exact: true }).click();
      await expect(page).not.toHaveURL(/\/cards\/new$/);
      await seedReviewHistory(page, courseId);
    }
    const originalCounts = [1, reviewed ? 1 : 0, reviewed ? 201 : 0, reviewed ? 1 : 0];
    expect(await courseRowCounts(page, courseId)).toEqual(originalCounts);
    await page.goto(`${courseUrl}/settings`);
    await page.getByRole('button', { name: 'Delete course', exact: true }).click();
    await page.getByRole('button', { name: 'Delete course', exact: true }).click();
    await expect(page.getByText("'Biology' deleted.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/#\/$/);
    expect(await courseRowCounts(page, courseId)).toEqual([0, 0, 0, 0]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Courses' })
        .getByRole('link', { name: 'Biology', exact: true }),
    ).toBeVisible();
    await expect.poll(() => courseRowCounts(page, courseId)).toEqual(originalCounts);
  });
}
