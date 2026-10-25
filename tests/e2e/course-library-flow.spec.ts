import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2, serviceWorkers: 'block' });

test('keeps the library coherent through a cold download and backtracking', async ({ page }) => {
  let release: () => void = () => {};
  const download = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/CourseLibraryImport-*.js', async (route) => {
    await download;
    await route.continue();
  });
  try {
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Course name' });
    const library = page.getByRole('button', { name: 'Course library', exact: true });
    await name.fill('Unfinished chemistry');
    await library.click();
    const back = page.getByRole('button', { name: 'Back to New course' });
    await expect(back).toBeEnabled();
    await expect(page.getByLabel('Loading the course library', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to New course' }).press('Escape');
    await expect(library).toBeFocused();
    await expect(name).toHaveValue('Unfinished chemistry');

    await library.press('Enter');
    await expect(back).toBeFocused();
    release();
    const search = page.getByRole('searchbox', { name: 'Search the course library' });
    await expect(search).toBeFocused();
    const subjects = page.getByRole('list', { name: 'Library subjects', exact: true });
    await expect(subjects).toBeVisible();
    const searchBounds = (await search.boundingBox())!;
    const subjectsBounds = (await subjects.boundingBox())!;
    expect(Math.abs(searchBounds.x - subjectsBounds.x)).toBeLessThan(1);
    expect(Math.abs(searchBounds.width - subjectsBounds.width)).toBeLessThan(1);
    await search.fill('8461');
    await page.getByRole('button', { name: 'Biology AQA GCSE · 8461', exact: true }).click();
    await page.getByRole('button', { name: 'Back to the course library' }).press('Escape');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('8461');
  } finally {
    release();
  }
});
