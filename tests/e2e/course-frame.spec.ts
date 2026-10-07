import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function openCourse(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('button', { name: 'Dismiss announcement' }).click();
  await page.getByRole('heading', { name: 'Welcome to Lacuna', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeVisible();
}

for (const width of [390, 1000, 1920]) {
  test(`Study and Review due cards share a row and height at ${width}px`, async ({ page }) => {
    await openCourse(page, width);
    const study = await page.getByRole('button', { name: 'Study', exact: true }).boundingBox();
    const practice = await page
      .getByRole('button', { name: 'Review due cards', exact: true })
      .boundingBox();
    expect(Math.abs(study!.y - practice!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(study!.height - practice!.height)).toBeLessThanOrEqual(1);
    expect(practice!.x).toBeGreaterThanOrEqual(study!.x + study!.width);
  });

  test(`course sections match Path's content width at ${width}px`, async ({ page }, testInfo) => {
    await openCourse(page, width);
    const measure = () =>
      page.locator('main h1').evaluate((title) => {
        const frame = title.closest('header')!.parentElement!;
        const rect = frame.getBoundingClientRect();
        const css = getComputedStyle(frame);
        return {
          left: rect.left + parseFloat(css.paddingLeft),
          right: rect.right - parseFloat(css.paddingRight),
          width: rect.width,
        };
      });
    const path = await measure();
    const availableWidth = await page.locator('main').evaluate((main) => main.clientWidth);
    expect(path.width).toBe(Math.min(1190, availableWidth));
    await page.screenshot({ path: testInfo.outputPath('Path.png') });
    for (const section of ['Cards', 'Questions', 'Analytics', 'Settings']) {
      await page
        .locator('nav[aria-label="Course sections"]:visible')
        .getByRole('link', { name: section, exact: true })
        .click();
      await expect(
        page.getByRole('heading', { level: 1, name: section, exact: true }),
      ).toBeVisible();
      const actual = await measure();
      expect(Math.abs(actual.left - path.left), `${section} left edge`).toBeLessThanOrEqual(1);
      expect(Math.abs(actual.right - path.right), `${section} right edge`).toBeLessThanOrEqual(1);
      expect(
        await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({ path: testInfo.outputPath(`${section}.png`) });
    }
  });
}
