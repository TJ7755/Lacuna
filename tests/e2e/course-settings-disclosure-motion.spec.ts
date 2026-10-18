import { expect, test, type Locator, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function sampleToggle(page: Page, button: Locator, activate: () => Promise<void>) {
  await button.scrollIntoViewIfNeeded();
  await button.hover();
  await page.waitForTimeout(300);
  await button.evaluate((element) => {
    const panel = document.getElementById(element.getAttribute('aria-controls')!)!;
    const frames: { x: number; y: number; width: number; height: number; body: number }[] = [];
    const start = performance.now();
    (window as unknown as { disclosureFrames: Promise<typeof frames> }).disclosureFrames =
      new Promise((resolve) => {
        function sample() {
          const rect = element.getBoundingClientRect();
          frames.push({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            body: panel.getBoundingClientRect().height,
          });
          if (performance.now() - start < 650) requestAnimationFrame(sample);
          else resolve(frames);
        }
        sample();
      });
  });
  await activate();
  const frames = await page.evaluate(
    () =>
      (
        window as unknown as {
          disclosureFrames: Promise<
            { x: number; y: number; width: number; height: number; body: number }[]
          >;
        }
      ).disclosureFrames,
  );
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    const values = frames.map((frame) => frame[key]);
    expect(Math.max(...values) - Math.min(...values), `header ${key} drift`).toBeLessThan(0.5);
  }
  return frames.map((frame) => frame.body);
}

for (const width of [1280, 390]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`settings headers stay still at ${width}px with ${reducedMotion} motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.emulateMedia({ reducedMotion });
      await enterFreshLacuna(page);
      await page
        .getByRole('region', { name: 'Today, most urgent first' })
        .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
        .click();
      const course = new URL(page.url()).hash;
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${course}/settings`);
      await expect(
        page.getByRole('heading', { name: 'Course settings', exact: true }),
      ).toBeVisible();
      await page.waitForTimeout(600);

      for (const title of ['Course details', 'Lessons', 'Auto-practice', 'Advanced scheduling']) {
        const button = page.getByRole('button', { name: new RegExp(`^${title}`) });
        const heights = await sampleToggle(page, button, async () => {
          await page.mouse.down();
          await page.waitForTimeout(90);
          await page.mouse.up();
        });
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        expect(heights.at(-1)).toBeGreaterThan(0);
        if (reducedMotion === 'no-preference') {
          expect(heights.some((height) => height > 0 && height < heights.at(-1)! - 1)).toBe(true);
        }
        await sampleToggle(page, button, () => button.click());
        await expect(button).toHaveAttribute('aria-expanded', 'false');
      }

      const details = page.getByRole('button', { name: /^Course details/ });
      for (const key of ['Enter', 'Space']) {
        await details.focus();
        await sampleToggle(page, details, () => page.keyboard.press(key));
        await expect(details).toHaveAttribute('aria-expanded', key === 'Enter' ? 'true' : 'false');
        await expect(details).toBeFocused();
      }
      await sampleToggle(page, details, async () => {
        await details.click();
        await page.waitForTimeout(60);
        await details.click();
        await page.waitForTimeout(60);
        await details.click();
      });
      await expect(details).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('textbox', { name: 'Course name' })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}
