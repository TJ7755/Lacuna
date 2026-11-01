import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('public beta requires consent, retains opt-out and offers a quota ID without an invitation', async ({
  page,
}) => {
  let hostedRequests = 0;
  await page.route('**/api/ai/**', async (route) => {
    hostedRequests++;
    await route.abort();
  });
  await enterFreshLacuna(page);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /^Integrations/ }).click();
  const toggle = page.getByRole('switch', { name: 'Mark my answers automatically' });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Copy quota ID' })).toHaveCount(0);
  await toggle.click();
  const warning = page.getByRole('alertdialog', { name: 'Before you turn on automatic marking' });
  await expect(warning).toContainText('personal data');
  await expect(warning).toContainText('experimental');
  await expect(
    warning.getByRole('heading', { name: 'Before you turn on automatic marking' }),
  ).toBeInViewport();
  const enable = warning.getByRole('button', { name: 'Turn on', exact: true });
  await expect(enable).toBeDisabled();
  await warning.screenshot({ path: test.info().outputPath('jev-beta-warning.png') });
  await page.keyboard.press('Shift+Tab');
  await expect(warning.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(warning.getByRole('link', { name: 'TypeSafe AI privacy policy' })).toBeFocused();
  await warning.getByRole('button', { name: 'Cancel' }).click();
  await expect(toggle).not.toBeChecked();
  expect(hostedRequests).toBe(0);
  await toggle.click();
  await warning.getByRole('checkbox').check();
  await enable.click();
  await expect(toggle).toBeChecked();
  await expect(page.getByLabel('Access code', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy quota ID' }).click();
  await expect(page.getByLabel('Quota ID', { exact: true })).toHaveText(/^[a-f0-9]{64}$/);
  await page
    .locator('#settings-jev')
    .screenshot({ path: test.info().outputPath('jev-beta-enabled.png') });
  expect(hostedRequests).toBe(0);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  const integrations = page.getByRole('button', { name: /^Integrations/ });
  if ((await integrations.getAttribute('aria-expanded')) === 'false') await integrations.click();
  await expect(toggle).not.toBeChecked();
  expect(hostedRequests).toBe(0);
});
