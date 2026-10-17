import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`opens imports inside Today and keeps the panel usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await enterFreshLacuna(page);
    await openImport(page);
    const panel = page.locator('.import-panel');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/#\/\?import=1$/);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    const checkBounds = async () => {
      const bounds = await panel.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    };
    await checkBounds();
    for (const source of ['Lacuna course', 'Anki deck', 'Text or spreadsheet']) {
      await panel.getByRole('button', { name: new RegExp(source) }).click();
      const back = panel.getByRole('button', { name: 'Back to import sources' });
      await expect(back).toBeVisible();
      await checkBounds();
      if (source === 'Text or spreadsheet') {
        await panel.getByRole('textbox', { name: 'Paste your cards' }).fill('Hello,Bonjour');
        await panel.getByRole('button', { name: 'Review cards' }).click();
        await expect(panel.getByRole('button', { name: 'Choose destination' })).toBeVisible();
        await checkBounds();
        await panel.getByRole('button', { name: 'Choose destination' }).click();
        await panel.getByRole('radio', { name: /Exam date/ }).check();
        await expect(panel.getByText('Exam date and time', { exact: true })).toBeVisible();
        await checkBounds();
      }
      if (source === 'Lacuna course') {
        const input = panel.getByRole('textbox', { name: 'Share link or code to import' });
        await input.focus();
        await expect(input).toHaveCSS('box-shadow', 'none');
        await expect(input.locator('..')).not.toHaveCSS('box-shadow', 'none');
      }
      await back.click();
      await expect(panel.getByText('Drop a file here')).toBeVisible();
      await expect(panel.getByRole('button', { name: new RegExp(source) })).toBeFocused();
    }
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(panel).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);
    // Bookmarks and links from the landing page still reach the same panel.
    await page.goto('/#/import');
    await expect(panel).toBeVisible();
    await expect(page).toHaveURL(/#\/\?import=1$/);
  });
}
