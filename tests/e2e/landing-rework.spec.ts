import { expect, test } from '@playwright/test';

test('FAQ supports keyboard disclosure and retained download navigation works', async ({
  page,
}) => {
  await page.goto('/#/landing');
  const summary = page.locator('.landing-faq summary').first();
  await summary.focus();
  await summary.press('Enter');
  await expect(
    page.getByText('Yes. Lacuna is free and open source, with no subscription.'),
  ).toBeVisible();
  await summary.press('Space');
  await expect(
    page.getByText('Yes. Lacuna is free and open source, with no subscription.'),
  ).toBeHidden();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Download for desktop' }).click();
  await expect(page).toHaveURL(/#\/download$/);
});

test('enlarged text fits the phone without clipping the new sections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.addStyleTag({
    content:
      '.landing-feature h2, .landing-feature p, .landing-faq h2, .landing-faq summary, .landing-ending h2 { font-size: 200% !important; }',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  for (const section of await page.locator('.landing-feature').all()) {
    const bounds = (await section.boundingBox())!;
    const copyBounds = (await section.locator('.landing-feature-copy').boundingBox())!;
    expect(copyBounds.x + copyBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(copyBounds.y + copyBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
});
