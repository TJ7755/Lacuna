import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

const IMAGE_FIXTURE = resolve('public/icons/icon-192.png');

async function openCourseCards(page: Page): Promise<{ courseId: string }> {
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();

  const match = /#\/course\/([^/]+)\/?.*$/.exec(page.url());
  if (!match) throw new Error(`Expected a course route, got ${page.url()}`);
  await page.goto(`/#/course/${match[1]}/cards`);
  await expect(page.getByRole('heading', { name: 'Cards' })).toBeVisible();
  return { courseId: match[1] };
}

async function addCard(page: Page, front: string, back: string, withImage = false) {
  await page
    .getByRole('group', { name: 'Add content' })
    .getByRole('button', { name: 'New card' })
    .click();
  const frontInput = page.getByRole('textbox', { name: 'Front' });
  await frontInput.fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(back);

  if (withImage) {
    await page.locator('input[type="file"][accept="image/*"]').first().setInputFiles(IMAGE_FIXTURE);
    await expect(frontInput).toHaveValue(/lacuna-asset:\/\//);
  }

  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+\/cards$/);
  await expect(page.getByText(front, { exact: true }).last()).toBeVisible();
}

async function openRecoverySettings(page: Page) {
  await page.goto('/#/settings');
  await expect(page).toHaveURL(/#\/settings$/);
  const settingsMain = page.locator('main[data-route-path="/settings"]');
  await expect(settingsMain.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(settingsMain.locator('#settings-export')).toBeAttached();
}

test('replaces a clean browser context with a media-bearing full backup', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await enterFreshLacuna(page);
  const source = await openCourseCards(page);
  const sourceFront = `Recovery source ${Date.now()}`;
  await addCard(page, sourceFront, 'Source backup answer', true);

  await openRecoverySettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /^Full backup Complete database/ }).click(),
  ]);
  const backupPath = await download.path();
  if (!backupPath) throw new Error('Expected the full backup download to have a local path.');

  const targetContext = await browser.newContext();
  try {
    const target = await targetContext.newPage();
    await enterFreshLacuna(target);
    await openCourseCards(target);
    const targetOnlyFront = `Recovery target only ${Date.now()}`;
    await addCard(target, targetOnlyFront, 'Target-only answer');

    await openRecoverySettings(target);
    await target.getByLabel('Recover this installation').setInputFiles(backupPath);
    await target.getByRole('button', { name: 'Replace local data' }).click();
    await target.getByRole('button', { name: 'Replace local data' }).click();
    await expect(target.getByText('Data replaced from backup.')).toBeVisible();

    await target.goto(`/#/course/${source.courseId}/cards`);
    await expect(target.getByText(sourceFront, { exact: true })).toBeVisible();
    await expect(target.getByText(targetOnlyFront, { exact: true })).toHaveCount(0);
    await expect(target.getByRole('img', { name: 'icon-192' })).toBeVisible();
  } finally {
    await targetContext.close();
  }
});
