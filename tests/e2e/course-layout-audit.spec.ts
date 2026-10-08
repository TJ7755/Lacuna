import { expect, test, type Locator, type Page } from '@playwright/test';
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

async function verifySecondaryText(page: Page) {
  const checks = await page.evaluate(() => {
    const probe = document.createElement('span');
    document.body.append(probe);
    const colour = (token: string) => {
      probe.style.color = `hsl(var(--${token}))`;
      return getComputedStyle(probe).color;
    };
    const luminance = (value: string) => {
      const [red, green, blue] = (value.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map(Number)
        .map((channel) => {
          const normalised = channel / 255;
          return normalised <= 0.04045 ? normalised / 12.92 : ((normalised + 0.055) / 1.055) ** 2.4;
        });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const backgrounds = ['paper', 'surface'].map((token) => luminance(colour(token)));
    const results = ['ink-soft', 'ink-faint'].map((token) => {
      const expected = colour(token);
      const text = luminance(expected);
      return {
        token,
        colours: [...document.querySelectorAll(`main .text-${token}`)]
          .filter((element) => element.getBoundingClientRect().height > 0)
          .slice(0, 6)
          .map((element) => getComputedStyle(element).color),
        expected,
        contrast: backgrounds.map(
          (background) => (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05),
        ),
      };
    });
    probe.remove();
    return results;
  });
  for (const check of checks) {
    for (const colour of check.colours) expect(colour).toBe(check.expected);
    for (const ratio of check.contrast) expect(ratio, check.token).toBeGreaterThanOrEqual(4.5);
  }
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`course sections keep their geometry and identity at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await enterFreshLacuna(page);
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
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
        await verifySecondaryText(page);
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

    test(`Settings and Help share their heading and frame at ${width}px in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await enterFreshLacuna(page);
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
      let baseline: Awaited<ReturnType<typeof geometry>> | undefined;
      for (const title of ['Settings', 'Help']) {
        await page.goto(`/#/${title.toLowerCase()}`);
        const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
        await expect(heading).toBeVisible();
        const measured = await geometry(heading);
        baseline ??= measured;
        expect(measured).toEqual(baseline);
        await verifySecondaryText(page);
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
}

for (const width of [390, 1440]) {
  test(`top-level pages retain the dark palette without overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
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
      await expect(page.locator('html')).toHaveClass(/dark/);
      await verifySecondaryText(page);
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
