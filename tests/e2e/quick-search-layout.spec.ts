import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`quick search keeps its drawing and remembers first-visit hints at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await enterFreshLacuna(page);
    const shortcut = await page.evaluate(() =>
      navigator.platform.startsWith('Mac') ? 'Meta+K' : 'Control+K',
    );
    await page.keyboard.press(shortcut);
    const dialog = page.getByRole('dialog', { name: 'Quick search' });
    const input = dialog.getByRole('combobox', { name: 'Search all content' });
    const drawing = dialog.locator('svg[viewBox="0 0 88 82"]');
    await expect(input).toHaveAttribute('placeholder', 'Search…');
    await expect(drawing).toBeVisible();
    await expect(drawing).toHaveAttribute('aria-hidden', 'true');
    await expect(dialog.getByText('Navigate')).toBeVisible();
    await expect(dialog.getByText('Esc', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Type to search across every course.')).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('first-visit.png'),
    });

    await input.press('Escape');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Courses', exact: true })).toBeVisible();
    await page.keyboard.press(shortcut);
    await expect(input).toBeFocused();
    await expect(drawing).toBeVisible();
    await expect(dialog.locator('kbd')).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath('return-visit.png'),
    });
    await input.fill('Welcome');
    await expect(dialog.getByRole('option').first()).toBeVisible();
    await expect(drawing).toHaveCount(0);
    await input.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/#\/course\//);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}
