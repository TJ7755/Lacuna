import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2, colorScheme: 'light' });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
});

test('an expanded first-note editor preserves typing, preview and save', async ({ page }) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Cell biology');
  await expect(page.getByRole('button', { name: 'New card', exact: true })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Other ways to study' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Title', exact: true });
  await expect(title).toBeFocused();
  await title.fill('Cell structure');
  await title.press('Escape');
  await expect(title).toHaveValue('Cell structure');
  await title.scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeInViewport({
    ratio: 1,
  });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(title).toBeHidden();
  await page.getByRole('button', { name: 'Add note', exact: true }).click();
  await title.fill('Cell structure');
  await page
    .getByRole('textbox', { name: 'Content', exact: true })
    .fill('The nucleus contains the genetic material.');
  await page.getByRole('button', { name: 'preview', exact: true }).click();
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: /^The nucleus contains the genetic material\.$/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'write', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Content', exact: true })).toHaveValue(
    'The nucleus contains the genetic material.',
  );
  await title.press('Control+Enter');
  await expect(page.getByRole('heading', { name: 'Cell structure', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeEnabled();
});
