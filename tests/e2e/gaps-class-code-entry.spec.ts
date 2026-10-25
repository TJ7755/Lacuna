import { expect, test } from '@playwright/test';
import { enterFreshLacuna, enterWithWelcomeCourse, openImport } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`dashboard class action is separate from statistics and keyboard accessible at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await enterWithWelcomeCourse(page);
    const join = page.getByRole('link', { name: 'Join a class', exact: true });
    await expect(join).toBeVisible();
    await expect(page.getByRole('region', { name: 'Today, most urgent first' })).toBeVisible();
    await join.click({ trial: true });
    const statistics = page.getByLabel(/^Today: \d+ cards?, about/);
    await expect(statistics).toBeVisible();
    expect(
      await statistics.evaluate((stats, link) => stats.contains(link), await join.elementHandle()),
    ).toBe(false);
    const actionBox = await join.boundingBox();
    await page.screenshot({ path: testInfo.outputPath(`dashboard-join-${width}.png`) });
    // A bordered control, unlike the plain statistics beside it.
    expect(await join.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
      'rgba(0, 0, 0, 0)',
    );
    expect(actionBox!.height).toBeGreaterThanOrEqual(44);
    expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(width);
    expect(await join.evaluate((element) => element.closest('ul, ol, [role="list"]'))).toBeNull();

    await join.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(join).toBeFocused();
    expect(await join.evaluate((element) => element.matches(':focus-visible'))).toBe(true);
    expect(await join.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe('none');
    await page.screenshot({ path: testInfo.outputPath(`dashboard-join-focus-${width}.png`) });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: /^Class code/ })).toBeFocused();
  });

  test(`finds class entry and corrects invalid or unavailable codes at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await enterFreshLacuna(page);
    await page.getByRole('link', { name: 'Join a class', exact: true }).click();
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
