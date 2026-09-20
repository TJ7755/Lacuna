import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('keeps optional Simple Learn tucked inside Study on desktop and mobile', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Anytime revision');
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Choose what to study' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Start Simple Learn' })).toBeHidden();
  await sheet.locator('summary').filter({ hasText: 'Simple Learn' }).click();
  const scope = sheet.getByLabel('Simple Learn scope');
  await expect(scope).toHaveCSS('appearance', 'base-select');
  await expect(scope).toHaveValue('');
  await scope.selectOption({ label: 'Lesson 1' });

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(sheet.getByRole('button', { name: 'Start Simple Learn' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await scope.click();
    await expect.poll(() => scope.evaluate((element) => element.matches(':open'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`simple-learn-${width}.png`) });
    await page.keyboard.press('Escape');
  }

  await sheet.getByRole('button', { name: 'Start Simple Learn' }).click();
  await expect(page).toHaveURL(/#\/lesson\/[^/]+\/learn\?mode=simple$/);
  await expect(sheet).toBeHidden();
});
