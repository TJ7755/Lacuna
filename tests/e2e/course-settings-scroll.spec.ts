import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('mobile course settings opens secondary settings from the keyboard without obstructing the fields', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/settings`);

  const details = page.getByRole('button', { name: 'Course details', exact: true });
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveCount(0);
  await details.focus();
  await details.press('Enter');
  await expect(details).toHaveAttribute('aria-expanded', 'true');
  const name = page.getByRole('textbox', { name: 'Course name', exact: true });
  await expect(name).toBeVisible();
  await name.scrollIntoViewIfNeeded();
  const bounds = (await name.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await name.click();
  await expect(name).toBeFocused();
  await details.click();
  await expect(details).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toHaveCount(0);
});
