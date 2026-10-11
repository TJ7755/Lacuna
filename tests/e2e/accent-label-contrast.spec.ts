import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const theme of ['Light', 'Dark']) {
  test(`saved alternative accents keep primary action labels legible in ${theme.toLowerCase()} mode`, async ({ page }) => {
    await enterFreshLacuna(page);
    for (const accent of ['Amber', 'Red', 'Rose', 'Pink', 'Violet', 'Blue', 'Teal', 'Green']) {
      await page.goto('/#/settings');
      await page.getByRole('radio', { name: theme, exact: true }).click();
      await page.getByRole('radio', { name: accent, exact: true }).click();
      await page.goto('/#/');
      await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
      await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
      const form = page.getByRole('form', { name: 'New course' });
      await form.getByRole('textbox', { name: 'Course name' }).fill('Colour check');
      const action = form.getByRole('button', { name: 'Create', exact: true });
      await expect(action).toBeEnabled();
      const ratio = await action.evaluate((button) => {
        const style = getComputedStyle(button);
        function luminance(colour: string) {
          const rgb = colour.match(/[\d.]+/g)!.map(Number).slice(0, 3);
          return rgb.map((value) => {
            const c = value / 255;
            return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
          }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
        }
        const values = [luminance(style.color), luminance(style.backgroundColor)].sort((a, b) => b - a);
        return (values[0] + 0.05) / (values[1] + 0.05);
      });
      expect(ratio, `${accent} primary label`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
