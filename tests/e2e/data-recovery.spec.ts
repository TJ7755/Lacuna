import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { Card } from '@lacuna/core/db/types';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

const IMAGE_FIXTURE = resolve('public/icons/icon-192.png');

async function openCourseCards(page: Page): Promise<{ courseId: string }> {
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();

  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const match = /#\/course\/([^/]+)\/?.*$/.exec(page.url());
  if (!match) throw new Error(`Expected a course route, got ${page.url()}`);
  await page.goto(`/#/course/${match[1]}/cards`);
  await expect(page.getByRole('heading', { name: 'Cards' })).toBeVisible();
  return { courseId: match[1] };
}

async function addCard(page: Page, front: string, back: string, withImage = false) {
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  const frontInput = page.getByRole('textbox', { name: 'Front' });
  await frontInput.fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(back);

  if (withImage) {
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(IMAGE_FIXTURE);
    await expect(frontInput).toHaveValue(/lacuna-asset:\/\//);
  }

  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+\/cards$/);
  // Search mounts the unassigned card's virtual section.
  await page.getByLabel('Search all cards').fill(front);
  await expect(page.getByText(front, { exact: true }).last()).toBeVisible();
}

async function openRecoverySettings(page: Page) {
  await page.goto('/#/settings#settings-export');
  await expect(page).toHaveURL(/#\/settings#settings-export$/);
  const settingsMain = page.locator('main:has([data-route-content="/settings"])');
  await expect(settingsMain.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(settingsMain.locator('#settings-export')).toBeVisible();
}

test('replaces a clean browser context with a media-bearing full backup', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await enterWithWelcomeCourse(page);
  const source = await openCourseCards(page);
  const sourceFront = `Recovery source ${Date.now()}`;
  await addCard(page, sourceFront, 'Source backup answer', true);

  await openRecoverySettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download full backup', exact: true }).click(),
  ]);
  const backupPath = await download.path();
  if (!backupPath) throw new Error('Expected the full backup download to have a local path.');

  const targetContext = await browser.newContext();
  try {
    const target = await targetContext.newPage();
    await enterWithWelcomeCourse(target);
    await openCourseCards(target);
    const targetOnlyFront = `Recovery target only ${Date.now()}`;
    await addCard(target, targetOnlyFront, 'Target-only answer');
    const targetOnlyCard = (await readAll<Card>(target, 'cards')).find((card) =>
      card.front.includes(targetOnlyFront),
    );
    if (!targetOnlyCard) throw new Error('Expected the target-only card before replacement.');

    await openRecoverySettings(target);
    await target.getByLabel('Recover this installation').setInputFiles(backupPath);
    await target.getByRole('button', { name: 'Replace local data' }).click();
    await target.getByRole('button', { name: 'Replace local data' }).click();
    await expect(target.getByText('Data replaced from backup.')).toBeVisible();

    await target.goto(`/#/course/${source.courseId}/cards`);
    await target.getByLabel('Search all cards').fill(sourceFront);
    await expect(target.getByText(sourceFront, { exact: true })).toBeVisible();
    // A filtered list cannot prove that target-only records were replaced.
    const restoredCards = await readAll<Card>(target, 'cards');
    expect(restoredCards.map((card) => card.id)).not.toContain(targetOnlyCard.id);
    await expect(target.getByRole('img', { name: 'icon-192' })).toBeVisible();
  } finally {
    await targetContext.close();
  }
});
