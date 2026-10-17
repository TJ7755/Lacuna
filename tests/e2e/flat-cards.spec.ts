import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

const accents = ['volt', 'violet', 'amber', 'red', 'rose', 'pink', 'blue', 'teal', 'green'];

async function expectFlatCards(page: Page) {
  const surfaces = page.locator('main .card-surface');
  expect(await surfaces.count()).toBeGreaterThan(0);
  for (const surface of await surfaces.all()) {
    await expect(surface).toHaveCSS('border-top-width', '1px');
    await expect(surface).toHaveCSS('border-top-style', 'solid');
    await expect(surface).toHaveCSS('box-shadow', 'none');
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`cards stay flat across every accent in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((theme) => localStorage.setItem('lacuna-theme', theme), theme);
    await enterFreshLacuna(page);
    await expect(page.getByRole('region', { name: 'New sharing features' })).toHaveCount(0);
    for (const accent of accents) {
      await page.evaluate((accent) => {
        document.documentElement.dataset.accent = accent;
      }, accent);
      await expectFlatCards(page);
      const row = page
        .getByRole('region', { name: 'Today, most urgent first' })
        .locator('.group')
        .first();
      const boundary = await row.evaluate((element) => {
        const style = getComputedStyle(element);
        const probe = document.createElement('span');
        probe.style.color = 'hsl(var(--ink-faint))';
        element.append(probe);
        const expected = getComputedStyle(probe).color;
        probe.remove();
        return { actual: style.borderTopColor, expected };
      });
      expect(boundary.actual, accent).toBe(boundary.expected);
      await row.hover();
      await expect(row).toHaveCSS('box-shadow', 'none');
    }
    await page.evaluate(() => {
      document.documentElement.dataset.accent = 'volt';
    });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`today-${theme}.png`),
    });
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Lessons', exact: true })).toBeVisible();
    for (const accent of accents) {
      await page.evaluate((accent) => {
        document.documentElement.dataset.accent = accent;
      }, accent);
      await expectFlatCards(page);
    }
    await page.evaluate(() => {
      document.documentElement.dataset.accent = 'volt';
    });
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`course-${theme}.png`),
    });
    const shortcut = await page.evaluate(() =>
      navigator.platform.startsWith('Mac') ? 'Meta+K' : 'Control+K',
    );
    await page.keyboard.press(shortcut);
    const dialog = page.getByRole('dialog', { name: 'Quick search' });
    const panel = dialog.locator('.card-surface');
    await expect(panel).toHaveCSS('border-top-width', '1px');
    await expect(panel).toHaveCSS('box-shadow', 'none');
    await page.getByRole('combobox', { name: 'Search all content' }).press('Escape');
    await page.getByRole('link', { name: 'Search content', exact: true }).click();
    await page.getByRole('combobox', { name: 'Search content' }).fill('derivative');
    const result = page.getByRole('option').first();
    await expect(result).toBeVisible();
    await expect(result).not.toHaveCSS('box-shadow', 'none');
  });
}
