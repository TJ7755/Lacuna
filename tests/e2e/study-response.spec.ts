import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('makes the revealed answer readable within a short interaction transition', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page
    .getByRole('button', { name: /Start:|Continue:/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const reveal = page.getByRole('button', { name: /Show answer/i }).last();
  await expect(reveal).toBeVisible();

  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  const elapsed = await reveal.evaluate((button) => {
    const front = document.querySelector('[data-study-card-id] .prose-lacuna')?.textContent;
    if (!front) throw new Error('The front of the study Card is missing.');
    return new Promise<number>((resolve, reject) => {
      const started = performance.now();
      (button as HTMLButtonElement).click();
      function sample() {
        const content = document.querySelector('[data-study-card-id] .prose-lacuna');
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
  // Lesson introduction is deliberately ungraded. Enter scheduled course review
  // before asserting that canonical review analytics exist.
  await page.goto(`/#/course/${courseId}/learn`);
  await page.reload();
  await expect(page.locator('[data-study-face="front"]').first()).toBeVisible();
  const frontText = await page.locator('[data-study-face="front"]').first().innerText();
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
  const row = page.locator('[tabindex="0"][aria-expanded]').filter({ hasText: frontPrefix });
  await expect(row).toHaveCount(1);
  await row.click();
  await expect(page.getByText('Mean response time', { exact: true })).toBeVisible();
  await expect(page.getByText('Accuracy', { exact: true })).toBeVisible();
});
