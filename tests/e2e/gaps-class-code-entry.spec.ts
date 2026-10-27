import { expect, test } from '@playwright/test';
import { enterFreshLacuna, enterWithWelcomeCourse, openImport } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`Today keeps class joining under Import at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await enterWithWelcomeCourse(page);
    await expect(page.getByRole('region', { name: 'Today, most urgent first' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join a class', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Join a class', exact: true })).toHaveCount(0);
    await expect(page.getByLabel(/^Today: \d+ reviews? due/)).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-${width}.png`) });
    await openImport(page);
    const join = page.getByRole('button', { name: /Join a class Enter your teacher/ });
    await join.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: /^Class code/ })).toBeFocused();
  });

  test(`finds class entry and corrects invalid or unavailable codes at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await enterFreshLacuna(page);
    await openImport(page);
    await page.getByRole('button', { name: /Join a class Enter your teacher/ }).click();
    const code = page.getByRole('textbox', { name: /^Class code/ });
    await expect(code).toBeFocused();
    await code.fill('short');
    await code.press('Enter');
    await expect(page.getByRole('alert')).toContainText('eight-character class code');
    await page.route('https://relay.getlacuna.app/class-codes/**', (route) =>
      route.fulfill({ status: 404, json: {} }),
    );
    await code.fill(' k7qm - 4xtp ');
    await code.press('Enter');
    await expect(
      page.getByText('No class uses that code. Check it with your teacher.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Enter another class code' }).click();
    await expect(code).toBeFocused();
    await expect(code).toHaveValue('');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`join-class-${width}.png`) });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await openImport(page);
    await page.getByRole('button', { name: /Join a class Enter your teacher/ }).click();
    await expect(code).toBeFocused();
    await page.getByRole('button', { name: 'Back to import sources' }).click();
    await expect(
      page.getByRole('button', { name: /Join a class Enter your teacher/ }),
    ).toBeFocused();
  });
}
