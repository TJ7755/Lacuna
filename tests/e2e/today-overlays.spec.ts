import { expect, test } from '@playwright/test';
import { enterFreshLacuna, importWelcomeCourse, openImport } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';

test.use({ serviceWorkers: 'block', viewport: { width: 1280, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' && !url.pathname.startsWith('/films/')
      ? route.continue()
      : route.fulfill({ status: 204, body: '' });
  });
});

test('short Today creation and import show their initial choices without scrolling', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await settle(form);
  for (const name of ['Create', 'Cancel'])
    await expect(form.getByRole('button', { name, exact: true })).toBeInViewport({ ratio: 1 });
  await form.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openImport(page);
  const lastSource = page.getByRole('button', { name: /Join a class/ });
  await settle(lastSource);
  await expect(lastSource).toBeInViewport({ ratio: 1 });
});

test('an open course menu stays usable after the desktop window narrows', async ({ page }) => {
  await page.setViewportSize({ width: 1470, height: 956 });
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
  await page.getByRole('button', { name: 'More for Welcome to Lacuna' }).click();
  const archive = page.getByRole('menuitem', { name: 'Archive', exact: true });
  await expect(archive).toBeVisible();
  await page.setViewportSize({ width: 1100, height: 720 });
  await expect(archive).toBeInViewport({ ratio: 1 });
  await archive.click();
  await expect(page.getByRole('dialog', { name: 'Archive Welcome to Lacuna?' })).toBeVisible();
});
