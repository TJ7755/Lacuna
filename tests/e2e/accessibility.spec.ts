import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('opens quick search from the keyboard and restores focus on Escape', async ({ page }) => {
  await enterFreshLacuna(page);

  const quickSearch = page.getByRole('button', { name: 'Quick search' });
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

  await expect(page).toHaveURL(/#\/course\/[^/]+\/study$/);
  await expect(page.getByRole('heading', { name: 'Lesson 1', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeVisible();
  await expect(shell).toHaveCount(0);
  await expect(study).toHaveCount(0);
});
