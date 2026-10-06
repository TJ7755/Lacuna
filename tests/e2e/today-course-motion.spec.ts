import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('Today course lift responds immediately to pointer and keyboard focus', async ({ page }) => {
  await enterFreshLacuna(page);
  const row = page
    .getByRole('region', { name: 'Today, most urgent first' })
    .locator(':scope > div')
    .first();
  await page.waitForTimeout(1000);
  const offset = () =>
    row.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m42);
  await row.hover();
  await page.waitForTimeout(100);
  expect(await offset()).toBeLessThan(-1);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(250);
  await row.getByRole('link').focus();
  await page.waitForTimeout(100);
  expect(await offset()).toBeLessThan(-1);
});

test('Today course creation expands inline with normal keyboard navigation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const trigger = page.locator('main').getByRole('button', { name: 'New course' });
  const centring = await trigger.evaluate((button) => {
    const icon = button.querySelector('svg')!.getBoundingClientRect();
    const label = button.lastElementChild!.getBoundingClientRect();
    const surface = button.parentElement!.getBoundingClientRect();
    return Math.abs((icon.left + label.right) / 2 - (surface.left + surface.right) / 2);
  });
  expect(centring).toBeLessThanOrEqual(1);
  await trigger.click();
  const form = page.getByRole('form', { name: 'New course' });
  await expect(form).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(form.getByRole('textbox', { name: 'Course name' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(form).toBeHidden();
  await expect(trigger).toBeFocused();
});
