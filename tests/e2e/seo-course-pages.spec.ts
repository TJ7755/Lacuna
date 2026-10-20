import { expect, test } from '@playwright/test';
import { libraryCourses } from '../../src/library/catalogue';

for (const width of [1440, 390]) {
  test(`course pages render and hydrate at ${width}px`, async ({ page, browser }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    for (const [name, path, heading] of [
      ['index', '/courses/', 'Revision courses'],
      ['biology', '/courses/biology4bi1/', 'Biology 4BI1'],
    ]) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(heading);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      await page.screenshot({
        path: testInfo.outputPath(`${name}-${width}.png`),
        fullPage: true,
      });
    }
    await expect(page.getByRole('link', { name: 'Start revising', exact: true })).toHaveAttribute(
      'href',
      libraryCourses[0].shareUrl!,
    );
    await page.getByRole('link', { name: 'All courses', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Revision courses');
    await page.getByRole('link', { name: 'Chemistry 4CH1', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chemistry 4CH1');
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
    expect(errors).toEqual([]);
    const context = await browser.newContext({ javaScriptEnabled: false });
    const crawler = await context.newPage();
    for (const course of libraryCourses) {
      await crawler.goto(`/courses/${course.id}/`);
      await expect(crawler.getByRole('heading', { level: 1 })).toHaveText(
        `${course.subject} ${course.code}`,
      );
      await expect(crawler.locator('ol li')).toHaveText([...course.topics]);
    }
    await context.close();
  });
}
