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
