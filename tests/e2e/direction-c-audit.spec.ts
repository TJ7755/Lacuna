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

test('Progress fits a phone, with today in view on the 30-day strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterFreshLacuna(page);
  await page.goto('/#/analytics');
  const strip = page.getByRole('grid', { name: 'Review activity over the last 30 days' });
  await expect(strip).toBeVisible();
  expect(
    await strip.evaluate((grid) => {
      const scroller = grid.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    }),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test('sidebar course names wrap to a second line instead of truncating', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const courses = page.getByRole('navigation', { name: 'Courses' });
  const link = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  const name = link.getByText('Welcome to Lacuna', { exact: true });
  expect(
    await name.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  // The glyph already sets the row height, so the second line costs no space.
  expect((await link.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await name.boundingBox())!.height).toBeGreaterThan(30);
});

test('card row actions meet the 44px target on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('link', { name: 'Cards', exact: true }).first().click();
  // The row's inline actions carry a title; the swipe tray's buttons are full-height already.
  await expect(page.locator('button[title="Edit card"]').first()).toBeAttached();
  for (const name of ['Flag card', 'Edit card']) {
    const box = (await page.locator(`button[title="${name}"]`).first().boundingBox())!;
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
  }
});
