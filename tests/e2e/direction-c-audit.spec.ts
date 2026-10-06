import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const height of [650, 900]) {
  test(`sidebar course and archive labels align without horizontal scrolling at ${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const courses = page.getByRole('navigation', { name: 'Courses' });
    const course = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    const archive = courses.getByRole('link', { name: 'Archived', exact: true });
    const name = course.getByText('Welcome to Lacuna', { exact: true });
    const archiveName = archive.getByText('Archived', { exact: true });
    expect(
      Math.abs((await name.boundingBox())!.x - (await archiveName.boundingBox())!.x),
    ).toBeLessThanOrEqual(1);
    expect(
      await courses.evaluate((element) => {
        const scroller = element.querySelector('.overflow-y-auto')!;
        return scroller.scrollWidth - scroller.clientWidth;
      }),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('sidebar.png') });
  });
}

for (const width of [390, 1440]) {
  test(`walkthrough captures top-level pages without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    for (const [route, title] of [
      ['/', 'Today'],
      ['/share', 'Share'],
      ['/import', 'Import'],
      ['/analytics', 'Progress'],
      ['/settings', 'Settings'],
      ['/help', 'Help'],
      ['/archived', 'Archived'],
    ] as const) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${title.toLowerCase()}.png`),
      });
    }
  });
}
