import { expect, test, type Locator } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function geometry(heading: Locator) {
  return heading.evaluate((element) => {
    const main = element.closest('main');
    const frame = element.closest('.max-w-\\[1190px\\]');
    if (!main || !frame) throw new Error('Missing shared page frame');
    const title = element.getBoundingClientRect();
    const bounds = frame.getBoundingClientRect();
    return {
      x: title.x,
      y: title.y + main.scrollTop,
      frameX: bounds.x,
      frameWidth: bounds.width,
      fontSize: getComputedStyle(element).fontSize,
    };
  });
}

for (const width of [390, 1440]) {
  test(`course sections keep their geometry and identity at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .click();
    const courseUrl = page.url();
    let baseline: Awaited<ReturnType<typeof geometry>> | undefined;
    for (const [suffix, title] of [
      ['', 'Welcome to Lacuna'],
      ['/cards', 'Cards'],
      ['/questions', 'Questions'],
      ['/settings', 'Course settings'],
    ] as const) {
      await page.goto(`${courseUrl}${suffix}`);
      const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
      await expect(heading).toBeVisible();
      const measured = await geometry(heading);
      baseline ??= measured;
      expect(Math.abs(measured.x - baseline.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.y - baseline.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(measured.frameWidth - baseline.frameWidth)).toBeLessThanOrEqual(1);
      expect(measured.fontSize).toBe(baseline.fontSize);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      if (!suffix) {
        await expect(
          page
            .locator('[data-course-page-navigation]')
            .getByRole('link', { name: 'Welcome to Lacuna', exact: true }),
        ).toHaveCount(0);
      }
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${title.replaceAll(' ', '-').toLowerCase()}.png`),
      });
    }
  });

  test(`Settings and Help share their heading and frame at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    let baseline: Awaited<ReturnType<typeof geometry>> | undefined;
    for (const title of ['Settings', 'Help']) {
      await page.goto(`/#/${title.toLowerCase()}`);
      const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
      await expect(heading).toBeVisible();
      const measured = await geometry(heading);
      baseline ??= measured;
      expect(measured).toEqual(baseline);
      if (width < 1280) {
        await expect(
          page.getByRole('combobox', {
            name: title === 'Settings' ? 'Jump to settings group' : 'Jump to help topic',
          }),
        ).toBeVisible();
      }
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
