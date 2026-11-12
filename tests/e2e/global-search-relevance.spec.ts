import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test('shares relevance and media labels across Quick search and Search', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  await openImport(page);
  await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
  const importer = page.locator('.card-import-panel');
  await importer
    .getByLabel('Paste your cards')
    .fill(
      [
        'Different prompt\tAnswer',
        'Membrane transport\tAnswer',
        'Membrane\tAnswer',
        `![audio](lacuna-asset://${'a'.repeat(64)})\tMembrane sound`,
        '![Cell diagram](lacuna-asset://image)\tMembrane diagram',
        '![](lacuna-asset://image)\tMembrane image',
      ].join('\n'),
    );
  await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
  await importer.getByRole('button', { name: 'Choose destination', exact: true }).click();
  await importer.getByLabel('Course title').fill('Cell diagram membrane course');
  const steady = importer.getByRole('radio', { name: /Steady retention/ });
  await steady.focus();
  await steady.press('Space');
  await importer.getByRole('button', { name: 'Import 6 cards' }).click();
  await expect(importer).toBeHidden();

  await page.goto('/#/');
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick search', exact: true });
  const quickInput = dialog.getByRole('combobox');
  await quickInput.fill('membrane');
  const quickRows = dialog.getByRole('option');
  await expect(quickRows).toHaveCount(7);
  await expect(quickRows.nth(0)).toHaveText(/^MembraneLesson 1$/);
  await expect(quickRows.nth(1)).toHaveText(/^Membrane transport/);
  await expect(quickRows.nth(2)).toHaveText(/^Cell diagram membrane course/);
  const labels = ['Audio clip', 'Cell diagram', 'Image'];
  for (const label of labels) {
    const row = quickRows
      .filter({ has: page.getByText(label, { exact: true }) })
      .filter({ hasText: 'Lesson 1' });
    await expect(row).toHaveCount(1);
    await expect(row.locator('svg').first()).toBeVisible();
    await expect(row.locator('img, audio')).toHaveCount(0);
  }
  const quickContents = await quickRows.allTextContents();
  await testInfo.attach('Quick search relevance and media', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await quickInput.fill('Cell diagram');
  await expect(quickRows).toHaveCount(7);
  await expect(quickRows.first()).toHaveText('Cell diagramLesson 1');
  await quickInput.fill('membrane');
  await expect(quickRows).toHaveCount(7);
  await quickInput.press('Enter');
  await expect(page).toHaveURL(/\/cards\/[^/]+\/edit$/);
  await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toHaveValue('Membrane');

  await page.goto('/#/search?q=membrane');
  const rows = page.getByRole('option');
  await expect(rows).toHaveCount(7);
  expect(await rows.allTextContents()).toEqual(quickContents);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await expect(rows).toHaveCount(7);
  for (const label of labels) {
    const row = rows
      .filter({ has: page.getByText(label, { exact: true }) })
      .filter({ hasText: 'Lesson 1' });
    await expect(row.locator('svg').first()).toBeVisible();
    await expect(row.locator('img, audio')).toHaveCount(0);
  }
  await testInfo.attach('Full Search relevance and media', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  const input = page.getByRole('combobox', { name: 'Search content' });
  await input.fill('Cell diagram');
  await expect(rows).toHaveCount(7);
  await expect(rows.first()).toHaveText('Cell diagramLesson 1');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/cards\/[^/]+\/edit$/);
  await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toHaveValue(
    '![Cell diagram](lacuna-asset://image)',
  );
});
