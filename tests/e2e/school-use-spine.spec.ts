import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';
import type { ReviewHistoryEntry } from '../../src/db/reviewHistory';

test('authors, persists and studies a card through the keyboard', async ({ page }, testInfo) => {
  const identity = `${testInfo.workerIndex}-${Date.now()}`;
  const courseName = `School spine ${identity}`;
  const front = `What is the school-spine marker ${identity}?`;
  const back = `The school-spine answer is ${identity}.`;

  await enterFreshLacuna(page);
  await createCourse(page, courseName);

  await page.getByRole('button', { name: 'Author mode' }).click();
  await expect(page.locator('[data-lesson-workspace-mode="edit"]')).toBeVisible();
  await page.getByRole('button', { name: 'New card', exact: true }).click();

  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(back);
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await expect(page.getByText(front, { exact: true })).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(
    page.getByRole('navigation', { name: 'Courses' }).getByRole('link', { name: courseName }),
  ).toBeVisible();
  await expect(page.getByText(front, { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const studyCard = page.locator('[data-study-card-id]');
  await expect(
    studyCard.locator('[data-study-face="front"]').getByText(front, { exact: true }),
  ).toBeVisible();
  const cardId = await studyCard.getAttribute('data-study-card-id');
  expect(cardId).toBeTruthy();
  await page.keyboard.press('Space');
  await expect(
    studyCard.locator('[data-study-face="back"]').getByText(back, { exact: true }),
  ).toBeVisible();
  await page.keyboard.press('Y');

  await expect(
    page.getByRole('main', { name: 'Study progress' }).getByRole('img', { name: 'Completed', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/^1 card reviewed/)).toHaveCount(0);
  await expect.poll(async () => {
    const reviews = await readAll<ReviewHistoryEntry>(page, 'reviewHistory');
    return reviews.filter((review) => review.cardId === cardId).length;
  }).toBe(1);
});
