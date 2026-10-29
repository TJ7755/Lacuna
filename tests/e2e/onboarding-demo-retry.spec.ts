import { expect, test } from '@playwright/test';

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 640, height: 600 },
]) {
  test(`a missed demo card explains the retry at ${viewport.width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();

    const feedback = page
      .getByRole('status')
      .filter({ hasText: 'Missed cards come back for practice.' });
    const reveal = page.getByRole('button', { name: 'Show answer', exact: true }).last();
    await expect(feedback).toHaveCount(0);
    await reveal.click();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await expect(reveal).toBeVisible();
    const question = page
      .getByText('How long does sunlight take to reach Earth?', { exact: true })
      .filter({ visible: true });
    await expect(question).toBeVisible();
    const card = page.locator('.study-card-surface').filter({ has: question });
    await expect(card).toHaveCSS('opacity', '1');
    await page.screenshot({ path: testInfo.outputPath('after-no.png'), animations: 'disabled' });

    await expect(feedback).toBeVisible();
    await expect(feedback).toContainText('Try recalling the answer, then show it again.');
    await expect(feedback).toContainText('Choose Yes if you remembered, or No to practise again.');
    await expect(feedback).toContainText('You can Exit at any time.');
    await expect(feedback).toBeInViewport({ ratio: 1 });
    await expect(reveal).toBeInViewport({ ratio: 1 });
    await expect(page.getByText('Step 1 of 4', { exact: true })).toBeAttached();

    // Another honest No keeps the same practice available, with its explanation.
    await reveal.click();
    await page.getByRole('button', { name: 'No', exact: true }).click();
    await expect(feedback).toBeVisible();
    await expect(reveal).toBeVisible();
    await expect(card).toHaveCSS('opacity', '1');
    await page.screenshot({
      path: testInfo.outputPath('retry-feedback.png'),
      animations: 'disabled',
    });

    if (viewport.width === 1280) {
      await reveal.click();
      await page.getByRole('button', { name: 'Yes', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Do you have an exam coming up?' }),
      ).toBeVisible();
      await expect(feedback).toHaveCount(0);
      await expect(page.getByText('Step 2 of 4', { exact: true })).toBeAttached();
    } else {
      // Leaving never requires falsely claiming recall.
      await page.getByRole('button', { name: 'Exit', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    }
  });
}
