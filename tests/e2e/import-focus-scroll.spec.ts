import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';

test('inline Import autofocus preserves the expanding surface scroll position', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.goto('/#/import');
  const heading = page.locator('main').getByRole('button', { name: 'Import', exact: true });
  const source = page.getByRole('button', { name: /Text or spreadsheet/ });
  await expect(source).toBeVisible();
  const surface = heading.locator('..');
  await surface.evaluate((element) => element.setAttribute('data-import-scroll-regression', ''));
  // Hold an intermediate expansion height so native autofocus must handle a clipped field.
  await page.addStyleTag({
    content:
      '[data-import-scroll-regression] { height: 240px !important; overflow: hidden !important; }',
  });
  await settle(surface);
  await source.evaluate((element) => element.focus({ preventScroll: true }));
  await surface.evaluate((element) => {
    element.scrollTop = 0;
  });
  const labelOffset = () =>
    heading.evaluate(
      (element) =>
        element.getBoundingClientRect().top - element.parentElement!.getBoundingClientRect().top,
    );
  const top = await labelOffset();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Paste your cards', exact: true })).toBeFocused();
  expect(await surface.evaluate((element) => element.scrollTop)).toBe(0);
  // A taller step can raise the whole surface; autofocus must not move its label within it.
  expect(Math.abs((await labelOffset()) - top)).toBeLessThanOrEqual(1);
});

test('open Import stays within the viewport when Today content reflows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await enterFreshLacuna(page);
  await page.goto('/#/import');
  const heading = page.locator('main').getByRole('button', { name: 'Import', exact: true });
  const surface = heading.locator('..');
  await expect(heading).toBeVisible();
  await settle(surface);
  // Late content or font metrics can move the trigger after the panel has opened.
  await page.locator('.today-empty-state').evaluate((element) => {
    element.style.paddingTop = '150px';
  });
  await expect
    .poll(async () => {
      const bounds = (await surface.boundingBox())!;
      return bounds.y + bounds.height;
    })
    .toBeLessThanOrEqual(826);
  const panel = page.locator('.import-panel');
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => {
      const bounds = (await panel.boundingBox())!;
      return bounds.x + bounds.width;
    })
    .toBeLessThanOrEqual(1280);
});
