import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test.describe(`search result navigation at ${width}px`, () => {
    test.use({
      viewport: { width, height: 844 },
      hasTouch: width === 390,
      reducedMotion: width === 390 ? 'reduce' : 'no-preference',
    });

    test('keeps arrowed results visible, continues the query, and restores search context', async ({
      page,
    }) => {
      await enterFreshLacuna(page);
      // Use the real importer so Cards retain their normal Course/Lesson ownership.
      await openImport(page);
      await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
      const importer = page.locator('.card-import-panel');
      await importer
        .getByLabel('Paste your cards')
        .fill(
          Array.from(
            { length: 100 },
            (_, i) => `Palatine ${String(i).padStart(3, '0')}\tLong explanation of the same topic.`,
          ).join('\n'),
        );
      await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
      await importer.getByRole('button', { name: 'Choose destination', exact: true }).click();
      await importer.getByLabel('Course title').fill('Search regression');
      const steady = importer.getByRole('radio', { name: /Steady retention/ });
      await steady.focus();
      await steady.press('Space');
      await importer.getByRole('button', { name: 'Import 100 cards' }).click();
      await expect(importer).toBeHidden();

      const shortcut = await page.evaluate(() =>
        navigator.platform.startsWith('Mac') ? 'Meta+K' : 'Control+K',
      );
      await page.keyboard.press(shortcut);
      const dialog = page.getByRole('dialog', { name: 'Quick search' });
      const quickInput = dialog.getByRole('combobox');
      await quickInput.fill('Palatine');
      await expect(dialog.getByRole('option')).toHaveCount(40);
      await expect(dialog.locator('[aria-live="polite"]')).toHaveText(
        '40 of 100 results available',
      );
      for (let i = 0; i < 39; i++) await quickInput.press('ArrowDown');
      const activeQuick = dialog.getByRole('option', { selected: true });
      await expect(activeQuick).toHaveText(/Palatine 039/);
      await expect
        .poll(async () =>
          activeQuick.evaluate((row) => {
            const viewport = row.closest('ul')!.parentElement!.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            return bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1;
          }),
        )
        .toBe(true);
      await expect(quickInput).toBeFocused();
      const continuation = dialog.getByRole('link', { name: 'See all results' });
      if (width === 390) await continuation.tap();
      else await continuation.click();
      await expect(dialog).toHaveCount(0);
      const input = page.getByRole('combobox', { name: 'Search content' });
      await expect(input).toHaveValue('Palatine');
      await expect(input).toBeFocused();
      await expect(page.getByRole('option')).toHaveCount(80);
      await expect(page.getByRole('status').filter({ hasText: 'results' })).toHaveText(
        '80 of 100 results',
      );
      // Filters remain ordinary Tab controls, outside the result-navigation arrows.
      await input.press('Tab');
      await expect(page.getByRole('button', { name: 'Due now' })).toBeFocused();
      await page.getByRole('button', { name: 'New', exact: true }).click();
      await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('option', { selected: true })).toHaveText(/Palatine 000/);
      await input.focus();
      for (let i = 1; i <= 80; i++) {
        await input.press('ArrowDown');
        await expect(page.getByRole('option', { selected: true })).toHaveText(
          new RegExp(`Palatine ${String(i).padStart(3, '0')}`),
        );
      }
      await expect(page.getByRole('option')).toHaveCount(100);
      const activeFull = page.getByRole('option', { selected: true });
      await expect(activeFull).toHaveText(/Palatine 080/);
      await expect(activeFull.locator('mark')).toHaveText('Palatine');
      const main = page.locator('main');
      await expect
        .poll(async () =>
          activeFull.evaluate((row) => {
            const viewport = row.closest('main')!.getBoundingClientRect();
            const bounds = row.getBoundingClientRect();
            return bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1;
          }),
        )
        .toBe(true);
      const scroll = await main.evaluate((element) => element.scrollTop);
      await input.press('Enter');
      await expect(page).toHaveURL(/\/cards\/[^/]+\/edit$/);
      await page.goBack();
      await expect(input).toHaveValue('Palatine');
      await expect(page.getByRole('button', { name: 'New', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await expect(page.getByRole('option')).toHaveCount(100);
      await expect
        .poll(async () => Math.abs((await main.evaluate((element) => element.scrollTop)) - scroll))
        .toBeLessThanOrEqual(1);
      await page.getByRole('option').nth(80).focus();
      await page.keyboard.press('Escape');
      await expect(input).toBeFocused();
      await expect(input).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  });
}
