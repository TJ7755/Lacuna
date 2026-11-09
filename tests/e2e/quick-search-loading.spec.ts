import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

test('Quick search can be dismissed before its code finishes loading', async ({
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
  try {
    await enterFreshLacuna(page);
    const opener = page.getByRole('button', { name: 'New course', exact: true });
    await opener.focus();
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Quick search', exact: true });
    await expect(dialog.getByRole('status', { name: 'Loading quick search' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close quick search' })).toBeFocused();
    await testInfo.attach('Quick search while loading', {
      body: await dialog.screenshot({ animations: 'disabled' }),
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();

    await page.keyboard.press('Control+k');
    await expect(dialog.getByRole('status')).toBeVisible();
    release();
    await expect(dialog.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(opener).toBeFocused();
  } finally {
    release();
  }
});
