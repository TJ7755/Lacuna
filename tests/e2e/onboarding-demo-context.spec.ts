import { expect, test } from '@playwright/test';

for (const width of [1280, 640]) {
  test(`the practice example explains the first revision at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/start$/);
    await expect(page.locator('[data-landing-transition]')).toHaveCount(0);
    const question = page
      .getByText('How long does sunlight take to reach Earth?', { exact: true })
      .filter({ visible: true });
    await expect(question).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('practice-example-question.png'),
      animations: 'disabled',
    });

    await expect(page.getByRole('heading', { name: 'Try a practice example' })).toBeInViewport();
    await expect(
      page.getByText('See how revision works before choosing your own material.', { exact: false }),
    ).toBeInViewport();
    await expect(
      page.getByText('Think of an answer, then select Show answer and check whether you knew it.', {
        exact: false,
      }),
    ).toBeInViewport();
    const reveal = page.getByRole('button', { name: 'Show answer', exact: true }).last();
    await expect(reveal).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    await reveal.click();
    await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
    await expect(page.locator('[data-study-face="back"]')).toContainText('About 8 minutes.');
    await page.screenshot({
      path: testInfo.outputPath('practice-example-answer.png'),
      animations: 'disabled',
    });
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Do you have an exam coming up?' }),
    ).toBeVisible();
    await page.getByRole('radio', { name: /^Not yet/ }).press('Space');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeVisible();

    const counts = await page.evaluate(
      () =>
        new Promise<Record<string, number>>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const stores = ['courses', 'cards', 'reviewHistory', 'sessionHistory'];
            const transaction = database.transaction(stores);
            const counts: Record<string, number> = {};
            transaction.oncomplete = () => {
              database.close();
              resolve(counts);
            };
            transaction.onerror = () => {
              database.close();
              reject(transaction.error);
            };
            for (const store of stores) {
              const count = transaction.objectStore(store).count();
              count.onsuccess = () => {
                counts[store] = count.result;
              };
            }
          };
        }),
    );
    expect(counts).toEqual({ courses: 0, cards: 0, reviewHistory: 0, sessionHistory: 0 });
  });
}
