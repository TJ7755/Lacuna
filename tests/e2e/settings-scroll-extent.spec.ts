import { expect, test, type Locator, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

async function expectNaturalScrollExtent(page: Page, lastContent: Locator, frame: Locator) {
  const bottomPadding = await frame.evaluate((element) =>
    parseFloat(getComputedStyle(element).paddingBottom),
  );
  await expect
    .poll(() =>
      lastContent.evaluate((element, padding) => {
        // AppShell scrolls main, rather than document.scrollingElement.
        const main = element.closest('main')!;
        const contentBottom =
          element.getBoundingClientRect().bottom -
          main.getBoundingClientRect().top +
          main.scrollTop;
        const normalBottom =
          contentBottom +
          parseFloat(getComputedStyle(element).marginBottom) +
          padding +
          parseFloat(getComputedStyle(main).paddingBottom);
        return main.scrollHeight - Math.max(main.clientHeight, normalBottom);
      }, bottomPadding),
    )
    .toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.scrollingElement!.scrollHeight)).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
}

for (const viewport of VIEWPORTS) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`collapsed Settings only scrolls to its content at ${viewport.width}x${viewport.height} with ${reducedMotion} motion`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion });
      await enterFreshLacuna(page);
      await page.goto('/#/settings');
      const groups = page.locator('section[id^="settings-group-"]');
      await expect(groups).toHaveCount(5);
      const feedback = page.getByRole('region', { name: 'Feedback' });
      const lastRow = (await feedback.count())
        ? feedback
        : page.locator('#settings-group-integrations h2');
      const frame = page
        .getByRole('heading', { level: 1, name: 'Settings', exact: true })
        .locator('../..');

      async function expectCollapsed() {
        for (const group of await groups.all()) {
          await expect(group.getByRole('button').first()).toHaveAttribute('aria-expanded', 'false');
          await expect
            .poll(() =>
              group.locator(':scope > div').evaluate((el) => el.getBoundingClientRect().height),
            )
            .toBe(0);
        }
        await expectNaturalScrollExtent(page, lastRow, frame);
      }

      await expectCollapsed();
      const integrations = page.getByRole('button', { name: /^Integrations/ });
      await integrations.click();
      await expect(
        page.getByRole('switch', { name: 'Mark my answers automatically' }),
      ).toBeVisible();
      await integrations.click();
      await expectCollapsed();
      await page
        .locator('main')
        .evaluate((element) =>
          element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }),
        );
      await page.screenshot({ path: test.info().outputPath('settings-bottom.png') });
    });
  }

  test(`Help and course Settings only scroll to their content at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await enterFreshLacuna(page);
    const courseUrl = await createCourse(page, 'Scroll extent');
    await page.setViewportSize(viewport);
    await page.goto('/#/help');
    await expect(page.getByRole('heading', { level: 1, name: 'Help' })).toBeVisible();
    let frame = page.getByRole('heading', { level: 1, name: 'Help', exact: true }).locator('../..');
    await expectNaturalScrollExtent(page, frame.locator(':scope > div').last(), frame);

    await page.goto(`${courseUrl}/settings`);
    await expect(page.getByRole('heading', { level: 1, name: 'Course settings' })).toBeVisible();
    frame = page.locator('#course-settings-danger').locator('../..');
    await expectNaturalScrollExtent(page, page.locator('#course-settings-danger > section'), frame);
  });
}
