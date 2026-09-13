import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('makes the revealed answer readable within a short interaction transition', async ({
  page,
}) => {
  const frontText = 'Which value is the response marker?';
  await enterFreshLacuna(page);
  await createCourse(page, 'Study response regression');
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill(frontText);
  await page.getByRole('textbox', { name: 'Back' }).fill('The response marker is forty-two.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await expect(page.locator('[data-card-id]').getByText(frontText, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const reveal = page.getByRole('button', { name: /Show answer/i }).last();
  await expect(reveal).toBeVisible();
  await expect(
    page.locator('[data-study-face="front"]').getByText(frontText, { exact: true }),
  ).toBeVisible();
  // Measure the flip after the study entrance settles, not two overlapping transitions.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });

  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  const elapsed = await reveal.evaluate((button) => {
    const front = document.querySelector('[data-study-face] .prose-lacuna')?.textContent;
    if (!front) throw new Error('The front of the study Card is missing.');
    return new Promise<number>((resolve, reject) => {
      const started = performance.now();
      (button as HTMLButtonElement).click();
      function sample() {
        const content = document.querySelector('[data-study-face] .prose-lacuna');
        let opacity = 1;
        for (let element = content; element; element = element.parentElement) {
          opacity *= Number(getComputedStyle(element).opacity);
        }
        if (content?.textContent && content.textContent !== front && opacity >= 0.9) {
          resolve(performance.now() - started);
        } else if (performance.now() - started > 3_000) {
          reject(new Error('The answer did not become readable.'));
        } else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
  });
  expect(elapsed).toBeLessThan(250);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.locator('[data-study-face="back"]')).toHaveCount(0);
  // Lesson introduction is deliberately ungraded. Enter scheduled course review
  // before asserting that canonical review analytics exist.
  await page.goto(`/#/course/${courseId}/learn`);
  await page.reload();
  await expect(page.locator('[data-study-face="front"]').first()).toBeVisible();
  const reviewedId = await page
    .locator('[data-study-face="front"]')
    .first()
    .evaluate((face) => face.closest('[data-study-card-id]')?.getAttribute('data-study-card-id'));
  await page
    .getByRole('button', { name: /Show answer/i })
    .last()
    .click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await page.waitForFunction(
    (cardId) =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const count = database
            .transaction('reviewHistory')
            .objectStore('reviewHistory')
            .index('cardId')
            .count(cardId!);
          count.onsuccess = () => {
            database.close();
            resolve(count.result > 0);
          };
          count.onerror = () => {
            database.close();
            reject(count.error);
          };
        };
      }),
    reviewedId,
  );
  await page.goto(`/#/course/${courseId}/cards`);
  const frontPrefix = frontText.trim().split(/\s+/).slice(0, 4).join(' ');
  await page.getByPlaceholder('Search all cards…').fill(frontPrefix);
  // Hover previews can display the back; the search still identifies this single Card.
  const row = page.locator(`[data-card-id="${reviewedId}"]`);
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByText('Mean response time', { exact: true })).toBeVisible();
  await expect(page.getByText('Accuracy', { exact: true })).toBeVisible();
});
