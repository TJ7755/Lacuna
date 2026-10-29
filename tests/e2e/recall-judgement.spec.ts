import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { createCourse } from './fixtures/lacunaApp';

const question = 'Did you remember the answer?';

async function checkRecallContext(
  page: Page,
  testInfo: TestInfo,
  stage: string,
  practice: boolean,
) {
  const reveal = page.getByRole('button', { name: 'Show answer', exact: true }).last();
  await expect(page.getByText(question, { exact: true })).toBeHidden();
  await reveal.click();
  const yes = page.getByRole('button', { name: 'Yes', exact: true });
  await expect(yes).toBeVisible();
  // Wait for the answer's ancestors too: a mounted back face can still be transparent.
  await expect
    .poll(async () =>
      page.locator('[data-study-face="back"]').evaluate((face) => {
        let opacity = 1;
        for (let node: Element | null = face; node; node = node.parentElement) {
          opacity *= Number(getComputedStyle(node).opacity);
        }
        return opacity;
      }),
    )
    .toBeGreaterThan(0.99);
  await expect(page.getByText('Card added.', { exact: true })).toBeHidden();
  // Capture both surfaces before checking the practice-only boundary.
  await page.screenshot({ path: testInfo.outputPath(`${stage}.png`), animations: 'disabled' });
  await testInfo.attach(stage, {
    path: testInfo.outputPath(`${stage}.png`),
    contentType: 'image/png',
  });
  const ratings = page.getByRole('group', { name: question, exact: true });
  if (practice) {
    await expect(ratings).toBeVisible();
    await expect(ratings.getByText(question, { exact: true })).toBeInViewport({ ratio: 1 });
    await expect(ratings.getByRole('button', { name: 'No', exact: true })).toBeInViewport({
      ratio: 1,
    });
    await expect(ratings.getByRole('button', { name: 'Yes', exact: true })).toBeInViewport({
      ratio: 1,
    });
  } else {
    await expect(page.getByText(question, { exact: true })).toHaveCount(0);
    await expect(ratings).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  }
}

for (const { inputMode, viewport } of [
  { inputMode: 'keyboard', viewport: { width: 1280, height: 800 } },
  { inputMode: 'touch', viewport: { width: 390, height: 844 } },
]) {
  test(`recall guidance appears only in the practice example with ${inputMode}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript((inputMode) => {
      localStorage.setItem('lacuna.inputMode', inputMode);
      localStorage.setItem('lacuna-theme', 'light');
    }, inputMode);
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await expect(page).toHaveURL(/#\/start$/);
    await checkRecallContext(page, testInfo, 'onboarding-answer', true);
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

    // Author at desktop width, then exercise the real card at the target width.
    await page.setViewportSize({ width: 1280, height: 800 });
    await createCourse(page, 'Recall judgement');
    const lessonId = /\/lesson\/([^/]+)$/.exec(page.url())![1];
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page
      .getByRole('textbox', { name: 'Front' })
      .fill('Carbon dioxide leaves a person in exhaled air. Excretion or egestion?');
    await page.getByRole('textbox', { name: 'Back' }).fill('Excretion.');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.setViewportSize(viewport);
    await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
    await expect(page.locator('[data-study-face="front"]')).toContainText('Excretion or egestion?');
    await checkRecallContext(page, testInfo, 'real-card-answer', false);
    await expect(page.locator('[data-study-face="back"]')).toContainText('Excretion.');
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeHidden();
  });
}
