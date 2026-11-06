import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

test('previews without changing scheduling, returns to search and offers existing view/edit routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Preview biology');
  const lessonPath = new URL(page.url()).hash.slice(1);
  await page.goto(`/#${lessonPath}/cards/new`);
  await page
    .getByRole('textbox', { name: 'Front', exact: true })
    .fill('**Selective permeability**');
  await page
    .getByRole('textbox', { name: 'Back', exact: true })
    .fill('Water crosses the membrane.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath}$`));
  const before = await readAll(page, 'cards');
  const historyBefore = await readAll(page, 'reviewHistory');
  await page.goto('/#/search?q=Selective&filter=new');
  const input = page.getByRole('combobox', { name: 'Search content' });
  await input.press('Enter');
  const preview = page.getByRole('dialog', { name: 'Card preview' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('strong')).toHaveText('Selective permeability');
  const question = preview.getByRole('button', { name: 'Question', exact: true });
  await expect(question).toBeFocused();
  await question.press('Shift+Tab');
  await expect(preview.getByRole('button', { name: 'Close card preview' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(preview.getByRole('link', { name: 'View lesson' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(preview.getByRole('button', { name: 'Close card preview' })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath('card-preview-question.png') });
  await preview.getByRole('button', { name: 'Answer', exact: true }).click();
  await expect(preview).toContainText('Water crosses the membrane.');
  await page.screenshot({ path: test.info().outputPath('card-preview-answer.png') });
  await page.keyboard.press('Escape');
  await expect(preview).toBeHidden();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('Selective');
  await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(await readAll(page, 'cards')).toEqual(before);
  expect(await readAll(page, 'reviewHistory')).toEqual(historyBefore);

  await page.keyboard.press('Control+k');
  const quick = page.getByRole('dialog', { name: 'Quick search' }).getByRole('combobox');
  await quick.fill('Selective');
  await quick.press('Enter');
  await expect(preview).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('card-preview-quick.png') });
  await preview.getByRole('button', { name: 'Close card preview' }).click();
  await expect(quick).toBeFocused();
  await expect(quick).toHaveValue('Selective');
  await quick.press('Enter');
  await preview.getByRole('link', { name: 'View lesson' }).click();
  await expect(page).toHaveURL(new RegExp(`${lessonPath}$`));
  await expect(preview).toBeHidden();
  await page.goto('/#/search?q=Selective');
  await input.press('Enter');
  await preview.getByRole('button', { name: 'Question', exact: true }).press('Shift+Enter');
  await expect(page).toHaveURL(/\/cards\/[^/]+\/edit$/);
  await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toHaveValue(
    '**Selective permeability**',
  );
});
