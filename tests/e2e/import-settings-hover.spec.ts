import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

test('Import settings hover contour clears the label text', async ({ page }, info) => {
  await enterFreshLacuna(page);
  await openImport(page);
  await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
  const panel = page.locator('.card-import-panel');
  const summary = panel.locator('summary', { hasText: 'Import settings' });
  await expect(summary).toBeVisible();
  await summary.hover();
  const feedback = summary.locator('.flow-feedback-layer');
  await expect(feedback).toHaveCSS('opacity', '0.045');
  const padding = await summary.evaluate((element) => {
    const style = getComputedStyle(element);
    return { left: parseFloat(style.paddingLeft), right: parseFloat(style.paddingRight) };
  });
  expect(padding.left).toBeGreaterThanOrEqual(8);
  expect(padding.right).toBeGreaterThanOrEqual(8);
  await panel.screenshot({ path: info.outputPath('import-settings-hover.png') });
  await info.attach('Import settings hover', {
    path: info.outputPath('import-settings-hover.png'),
    contentType: 'image/png',
  });
});
