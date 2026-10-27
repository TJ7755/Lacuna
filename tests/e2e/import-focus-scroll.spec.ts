import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';

test('inline Import autofocus preserves the expanding surface scroll position', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await page.goto('/#/import');
  const heading = page.locator('main span[aria-hidden="true"]').filter({ hasText: /^Import$/ });
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
  const top = await heading.evaluate((element) => element.getBoundingClientRect().top);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Paste your cards', exact: true })).toBeFocused();
  expect(await surface.evaluate((element) => element.scrollTop)).toBe(0);
  expect(
    Math.abs((await heading.evaluate((element) => element.getBoundingClientRect().top)) - top),
  ).toBeLessThanOrEqual(1);
});

test('open Import stays anchored when Today content reflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enterFreshLacuna(page);
  await page.goto('/#/import');
  const heading = page.locator('main span[aria-hidden="true"]').filter({ hasText: /^Import$/ });
  const surface = heading.locator('..');
  await expect(heading).toBeVisible();
  await settle(surface);
  const top = (await surface.boundingBox())!.y;
  // Late content or font metrics can move the trigger after the panel has opened.
  await page.locator('.today-empty-state').evaluate((element) => {
    element.style.paddingTop = '150px';
  });
  await expect
    .poll(async () => Math.abs((await surface.boundingBox())!.y - top))
    .toBeLessThanOrEqual(1);
  const panel = page.locator('.import-panel');
  await expect.poll(async () => (await panel.boundingBox())!.x).toBeGreaterThanOrEqual(0);
  await expect
    .poll(async () => {
      const bounds = (await panel.boundingBox())!;
      return bounds.x + bounds.width;
    })
    .toBeLessThanOrEqual(390);
});
