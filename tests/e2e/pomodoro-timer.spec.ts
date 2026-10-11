import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('keeps timer focus in its popup and restores elapsed time after reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Timer regression');
  await page.getByRole('button', { name: 'Author mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).click();
  await page.getByRole('textbox', { name: 'Front' }).fill('A timer regression card');
  await page.getByRole('textbox', { name: 'Back' }).fill('Elapsed focus time survives a reload.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  await page.getByRole('link', { name: 'Course', exact: true }).click();
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose what to study' });
  await sheet.locator('summary').filter({ hasText: 'Simple Learn' }).click();
  await sheet.getByRole('button', { name: 'Start Simple Learn' }).click();

  const trigger = page.getByRole('button', { name: 'Pomodoro timer', exact: true });
  await trigger.click();
  const popup = page.getByRole('dialog', { name: 'Pomodoro timer' });
  await expect(popup.getByRole('button', { name: 'Start', exact: true })).toBeFocused();
  const timerStart = new Date('2026-10-09T12:00:00Z');
  await page.clock.install({ time: timerStart });
  await page.clock.pauseAt(new Date(timerStart.getTime() + 1000));
  await popup.getByRole('button', { name: 'Start', exact: true }).click();
  await popup.getByRole('button', { name: 'Reset' }).focus();
  await page.keyboard.press('Tab');
  await expect(popup.getByRole('button', { name: 'Pause', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Focus · 25:00' })).toBeFocused();

  await page.clock.setSystemTime(new Date(timerStart.getTime() + 66_000));
  await page.reload();
  await page.clock.resume();
  await expect(page.getByRole('button', { name: 'Focus · 23:55' })).toBeVisible();
  await page.getByRole('button', { name: 'Focus · 23:55' }).click();
  await expect(popup.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
});
