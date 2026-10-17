import { expect, test } from '@playwright/test';

test('method opens its technical detail on request without hiding the probability explorer', async ({
  page,
}) => {
  await page.goto('/#/welcome');
  await page.getByRole('link', { name: 'The method' }).click();
  const explore = page.getByRole('button', { name: 'Explore the method' });
  await expect(explore).toBeVisible();
  await explore.click();
  await expect(page.getByRole('heading', { name: 'First, a naming correction' })).toBeInViewport();

  const slider = page.getByRole('slider', { name: 'Weighted sum z' });
  await expect(slider).toBeVisible();
  const detail = page.locator('.method-details');
  const disclosure = detail.getByRole('button', { name: 'The ten weights, exactly as shipped' });
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.click();
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  await expect(
    detail.getByText('Notice that succeeded and failed are exact mirror images.', { exact: false }),
  ).toBeVisible();
  await disclosure.focus();
  await page.keyboard.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1.7');
});
