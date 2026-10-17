import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

// Every page shares one content frame, so titles start on the same edge as you move around.
for (const width of [1440, 1920]) {
  test(`page titles share one left edge at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .click();
    const courseTitle = page.getByRole('heading', { level: 1, name: 'Welcome to Lacuna' });
    await expect(courseTitle).toBeVisible();
    const edge = (await courseTitle.boundingBox())!.x;
    const base = page.url().replace(/#.*$/, '');
    let top: number | undefined;
    for (const [route, title] of [
      ['settings', 'Settings'],
      ['import', 'Import'],
      ['analytics', 'Progress'],
      ['help', 'Help'],
      ['share', 'Share'],
      ['archived', 'Archived'],
    ] as const) {
      await page.goto(`${base}#/${route}`);
      const heading = page.getByRole('heading', { level: 1, name: title, exact: true });
      await expect(heading).toBeVisible();
      await expect
        .poll(async () => Math.abs((await heading.boundingBox())!.x - edge), {
          message: `${title} title edge`,
        })
        .toBeLessThanOrEqual(1);
      // Top-level pages also start their title at the same height. Import is a two-level
      // flow: like the course sections, it keeps a navigation row (Back) above its title.
      if (title === 'Import') continue;
      const y = (await heading.boundingBox())!.y;
      top ??= y;
      expect(Math.abs(y - top), `${title} title top`).toBeLessThanOrEqual(2);
    }
  });
}
