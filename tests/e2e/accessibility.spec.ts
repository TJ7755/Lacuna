import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('opens quick search from the keyboard and restores focus on Escape', async ({ page }) => {
  await enterFreshLacuna(page);

  const quickSearch = page.getByRole('link', { name: 'Search', exact: true });
  await quickSearch.focus();
  const shortcut = await page.evaluate(() =>
    navigator.platform.startsWith('Mac') ? 'Meta+K' : 'Control+K',
  );
  await page.keyboard.press(shortcut);

  const search = page.getByRole('combobox');
  await expect(page.getByRole('dialog', { name: 'Quick search' })).toBeVisible();
  await expect(search).toBeFocused();
  await search.press('Escape');

  await expect(page.getByRole('dialog', { name: 'Quick search' })).toHaveCount(0);
  await expect(quickSearch).toBeFocused();
});

test('opens quick search from the mobile drawer and restores its navigation trigger', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const openNavigation = page.getByRole('button', { name: 'Open navigation', exact: true });
  await openNavigation.focus();
  await openNavigation.press('Enter');
  const searchLink = page
    .getByRole('complementary')
    .getByRole('link', { name: 'Search', exact: true });
  await searchLink.focus();
  const shortcut = await page.evaluate(() =>
    navigator.platform.startsWith('Mac') ? 'Meta+K' : 'Control+K',
  );
  await page.keyboard.press(shortcut);
  const dialog = page.getByRole('dialog', { name: 'Quick search' });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole('complementary')).toHaveCount(0);
  const search = dialog.getByRole('combobox');
  await expect(search).toBeFocused();
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('mobile-quick-search.png'),
  });
  await search.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(openNavigation).toBeFocused();
});

test('replaces the shell when entering study with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
    true,
  );

  await createCourse(page, `Reduced motion course ${Date.now()}`);
  const shell = page.getByRole('navigation', { name: 'Primary navigation' });
  const study = page.getByRole('button', { name: 'Study', exact: true });
  await expect(shell).toBeVisible();
  await study.click();
  await chooseScheduledStudy(page);

  await expect(page).toHaveURL(/#\/course\/[^/]+\/study$/);
  await expect(page.getByRole('heading', { name: 'Lesson 1', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await expect(shell).toHaveCount(0);
  await expect(study).toHaveCount(0);
});
