import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

test('finds published Question Sets in both global search surfaces', async ({ page }, testInfo) => {
  await enterFreshLacuna(page);
  const courseUrl = await createCourse(page, 'Biology search', false);
  const coursePath = new URL(courseUrl).hash.slice(1);
  await page.goto('/#' + coursePath + '/questions');
  await page.getByRole('button', { name: 'New question set', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Cell practice');
  await page.keyboard.press('Enter');
  const prompt = page.getByRole('textbox', { name: 'Q1 question', exact: true });
  await prompt.fill('Explain selective permeability in a cell membrane.');
  await page
    .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
    .fill('Aquaporin selectivity criterion');
  await prompt.press('Control+Enter');
  await expect(page).toHaveURL(/question-sets\/[^/]+$/);
  const setUrl = page.url();

  await page.goto('/#/search?q=aquaporin%20selectivity%20criterion');
  await expect(page.getByText('No results', { exact: true })).toBeVisible();
  const fullSearch = page.getByRole('combobox', { name: 'Search content' });
  await fullSearch.fill('selective permeability');
  const result = page.getByRole('option', { name: /Cell practice/ });
  await expect(result).toContainText('selective permeability');
  await testInfo.attach('Question Set in Search content', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await result.click();
  await expect(page).toHaveURL(setUrl);

  await page.goto('/#/');
  await page.keyboard.press('Control+k');
  const quickSearch = page.getByRole('dialog', { name: 'Quick search', exact: true });
  const input = quickSearch.getByRole('combobox');
  await input.fill('Cell practice');
  await expect(quickSearch.getByRole('option', { name: /Cell practice/ })).toBeVisible();
  await testInfo.attach('Question Set in Quick search', {
    body: await page.screenshot({ animations: 'disabled' }),
    contentType: 'image/png',
  });
  await input.press('Enter');
  await expect(quickSearch).toBeHidden();
  await expect(page).toHaveURL(setUrl);
});
