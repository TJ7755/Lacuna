import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

test('uncached quick search stays visible, dismissible and focus-safe', async ({
  page,
}, testInfo) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/CommandPalette-*.js', async (route) => {
    await held;
    await route.continue();
  });
  await enterFreshLacuna(page);
  const opener = page.getByRole('button', { name: 'New course', exact: true });
  await opener.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Quick search', exact: true });
  await expect(dialog.getByRole('status', { name: 'Loading quick search' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close quick search' })).toBeFocused();
  await expect(page.locator('main')).toHaveJSProperty('inert', false);
  await expect(page.locator('main').locator('xpath=ancestor::*[@inert]').first()).toHaveAttribute(
    'inert',
    '',
  );
  await page.screenshot({
    path: testInfo.outputPath('quick-search-loading.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await page.keyboard.press('Control+k');
  await expect(dialog.getByRole('status')).toBeVisible();
  release();
  await expect(dialog.getByRole('combobox')).toBeFocused();
  await expect(dialog.getByRole('status')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();
});

test('a slow uncached page shows a delayed SVG and clears it on arrival', async ({
  page,
}, testInfo) => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/publicPages-*.js', async (route) => {
    await held;
    await route.continue();
  });
  await enterFreshLacuna(page);
  await page.evaluate(() => {
    window.location.hash = '#/privacy';
  });
  await expect(page.getByRole('status', { name: 'Loading', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('page-loading.png'), animations: 'disabled' });
  release();
  await expect(page.getByRole('heading', { name: /Privacy/ }).first()).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading', exact: true })).toBeHidden();
});
