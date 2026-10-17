import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('AI and study pills retain keyboard choices after reloading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/settings#settings-ai');
  const external = page.getByRole('radio', { name: 'External AI client' });
  await external.focus();
  await external.press('ArrowRight');
  const hosted = page.getByRole('radio', { name: 'Built-in AI' });
  await expect(hosted).toBeChecked();
  await expect(hosted).toBeFocused();
  await page.reload();
  await expect(hosted).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Enable AI', exact: true })).not.toBeChecked();

  await page.goto('/#/settings#settings-study');
  const speed = page.getByRole('radiogroup', { name: 'Audio playback speed' });
  await speed.getByRole('radio', { name: '1×', exact: true }).focus();
  await page.keyboard.press('End');
  const strictness = page.getByRole('radiogroup', { name: 'Grading strictness' });
  await strictness.getByRole('radio', { name: 'lenient' }).focus();
  await page.keyboard.press('End');
  await page.reload();
  await expect(speed.getByRole('radio', { name: '1.5×' })).toBeChecked();
  await expect(strictness.getByRole('radio', { name: 'exact' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Autoplay audio cards' })).toBeChecked();
});

test('Question switches save generator configuration and suspension', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Switches');
  const courseId = new URL(page.url()).hash.split('/')[2];
  await page.goto(`/#/course/${courseId}/questions/new`);
  await page.getByPlaceholder('Completing the square').fill('Quadratic roots');
  await page.getByPlaceholder('A single piece of knowledge').fill('Roots');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Generated family' }).click();
  await page.getByRole('switch', { name: 'Allow repeated roots' }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Create Question' }).click();
  const edit = page.getByRole('link', { name: 'Edit Quadratic roots' });
  await edit.click();
  await expect(page.getByRole('switch', { name: 'Allow repeated roots' })).toBeChecked();
  await page.getByRole('switch', { name: 'Suspend this Question' }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'Save Question' }).click();
  await edit.click();
  await expect(page.getByRole('switch', { name: 'Suspend this Question' })).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Allow repeated roots' })).toBeChecked();
});
