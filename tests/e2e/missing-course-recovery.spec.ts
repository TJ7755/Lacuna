import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const pagePath of ['analytics', 'question-sets/missing', 'question-sets/missing/edit']) {
  test(`missing course offers recovery from ${pagePath}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await enterFreshLacuna(page);
    await page.goto(`/#/course/missing-course/${pagePath}`);

    await expect(
      page.getByRole('heading', { name: 'This course could not be found.', exact: true }),
    ).toBeVisible();
    const back = page.getByRole('link', { name: 'Back to Today', exact: true });
    await back.focus();
    await page.screenshot({
      path: testInfo.outputPath(`missing-course-${pagePath.replaceAll('/', '-')}.png`),
      animations: 'disabled',
    });
    await back.press('Enter');
    await expect(page).toHaveURL(/#\/$/);
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  });
}
