import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function lessonIdForCourse(page: Page, courseId: string) {
  return page.evaluate(
    (expectedCourseId) =>
      new Promise<string | undefined>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('lessons', 'readonly');
          const lessons = transaction.objectStore('lessons').getAll();
          lessons.onerror = () => reject(lessons.error);
          lessons.onsuccess = () => {
            request.result.close();
            resolve(
              (lessons.result as { id: string; courseId: string }[]).find(
                (lesson) => lesson.courseId === expectedCourseId,
              )?.id,
            );
          };
        };
      }),
    courseId,
  );
}

test('learns a poem by cumulative recitation', async ({ page }, testInfo) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Poems');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  const lessonId = await lessonIdForCourse(page, courseId!);
  expect(lessonId).toBeTruthy();

  await page.goto(`/#/course/${courseId}/lesson/${lessonId}/sequence/new`);
  await page.getByRole('button', { name: /Poetry/ }).click();
  await page.getByRole('textbox', { name: 'Sequence name' }).fill('Because I could not stop');
  await page.getByRole('textbox', { name: 'Line 1 content' }).fill('Because I could not stop for Death');
  await page.getByRole('button', { name: /Add another line/ }).click();
  await page.getByRole('textbox', { name: 'Line 2 content' }).fill('He kindly stopped for me');
  await page.getByRole('button', { name: 'Add sequence' }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/lesson/${lessonId}$`));

  await page.goto('/#/');
  await page.getByRole('button', { name: 'Study Poems' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Recite', exact: true })).toBeVisible();
  await expect(page.getByText('Because I could not stop for Death')).toBeVisible();
  await page.getByRole('button', { name: 'Recite', exact: true }).click();
  await expect(page.getByText('Because I could not stop for Death')).toHaveCount(0);
  await page.getByRole('textbox', { name: 'line 1' }).fill('Because I could not stop for death');
  // Matching text still needs a manual mark.
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'All correct' })).toBeVisible();
  await page.getByRole('button', { name: 'All correct' }).click();

  await expect(page.getByText('He kindly stopped for me')).toBeVisible();
  await page.getByRole('button', { name: 'Recite', exact: true }).click();
  await page.getByRole('textbox', { name: 'line 1' }).fill('Because I could not stop for Death');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'line 2' }).fill('He stopped for me');
  const green = page.locator('[data-session-card-status="correct"]');
  await expect(green).toHaveCount(1);
  await expect(green).toHaveClass(/bg-positive/);
  await expect(green).toHaveClass(/border-accent/);
  await expect(page.getByRole('heading', { name: 'Because I could not stop', exact: true })).toHaveCSS('position', 'absolute');
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.getByRole('button', { name: 'Check', exact: true })).toBeInViewport();
    await page.screenshot({ path: testInfo.outputPath(`recitation-${width}.png`) });
  }
  await page.screenshot({ path: process.env.RECITATION_SHOTS ? `${process.env.RECITATION_SHOTS}/recall.png` : undefined });
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: 'line 2: correct' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'line 2: correct' }).click();
  await expect(page.getByRole('button', { name: 'line 2: marked wrong' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  if (process.env.RECITATION_SHOTS) await page.waitForTimeout(400);
  await page.screenshot({ path: process.env.RECITATION_SHOTS ? `${process.env.RECITATION_SHOTS}/check.png` : undefined });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('textbox', { name: 'line 2' })).toBeVisible();
  await page.getByRole('textbox', { name: 'line 1' }).fill('Because I could not stop for Death');
  await page.getByRole('textbox', { name: 'line 2' }).fill('He kindly stopped for me');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'All correct' }).click();

  await expect(page.getByRole('button', { name: 'Recite', exact: true })).toHaveCount(0);
});
