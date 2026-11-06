import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('narrow desktop navigation expands without shrinking content and returns focus', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await enterFreshLacuna(page);
  const main = await page.locator('main').boundingBox();
  const expand = page.getByRole('button', { name: 'Expand sidebar', exact: true });
  await expand.press('Enter');
  const navigation = page.getByRole('dialog', { name: 'Navigation', exact: true });
  await expect(navigation.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  expect((await page.locator('main').boundingBox())?.width).toBe(main?.width);
  await page.screenshot({
    path: testInfo.outputPath('desktop-navigation-expanded.png'),
    animations: 'disabled',
  });
  await page.keyboard.press('Escape');
  await expect(expand).toBeFocused();
  await expand.press('Enter');
  await page.keyboard.press('Control+k');
  await expect(page.getByRole('dialog', { name: 'Quick search' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(expand).toBeFocused();
});

test('sidebar customisation matches the rendered groups and settings shortcuts find data', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await page.goto('/#/settings#settings-sidebar');
  await expect(page.getByRole('button', { name: 'Move Share up', exact: true })).toBeDisabled();
  await expect(page.getByRole('switch', { name: 'Show Settings', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Share down', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'More', exact: true }).getByRole('link').first(),
  ).toHaveText('Settings');
  await page.screenshot({
    path: testInfo.outputPath('sidebar-groups.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Jump to data settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Your data/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  await expect(page.locator('#settings-backups')).toBeVisible();
  await expect(page.locator('#settings-backups').getByRole('heading').first()).toBeInViewport();
  await page.screenshot({
    path: testInfo.outputPath('settings-section-jump.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /^Your data/ }).click();
  await page.getByRole('button', { name: 'Jump to data settings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Your data/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});
