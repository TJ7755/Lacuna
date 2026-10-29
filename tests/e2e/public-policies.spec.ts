import { expect, test } from '@playwright/test';

for (const width of [1280, 800]) {
  test(`a visitor can read privacy and terms before entering at ${width}px`, async ({
    page,
    browser,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByText('Is Lacuna free?', { exact: true }).click();
    await expect(
      page.getByText('Yes. Lacuna is free and open source, with no subscription.'),
    ).toBeVisible();
    const footer = page.getByRole('contentinfo');
    await footer.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('footer.png') });
    await expect(footer.getByRole('link', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms', exact: true })).toBeVisible();

    await footer.getByRole('link', { name: 'Privacy', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Privacy · Lacuna');
    await expect(page.getByText(/IndexedDB/)).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Simple Analytics data collection' }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('privacy.png'), fullPage: true });
    await page
      .getByRole('navigation', { name: 'Public information' })
      .getByRole('link', { name: 'Terms', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Terms', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Terms · Lacuna');
    await expect(page.getByRole('link', { name: 'MIT licence', exact: true })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/LICENSE',
    );
    await page.screenshot({ path: testInfo.outputPath('terms.png'), fullPage: true });
    await page.getByRole('link', { name: 'Back to Lacuna' }).click();
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'Privacy', exact: true }),
    ).toBeAttached();

    // Bookmarks must work in a fresh profile, without the landing handover flag.
    for (const route of ['privacy', 'terms']) {
      const fresh = await browser.newPage({ viewport: { width, height: 800 } });
      try {
        await fresh.goto(`/#/${route}`);
        await expect(
          fresh.getByRole('heading', {
            name: route === 'privacy' ? 'Privacy' : 'Terms',
            exact: true,
          }),
        ).toBeVisible();
        await fresh.reload();
        await expect(fresh).toHaveURL(new RegExp(`#/${route}$`));
        await expect(
          fresh.getByRole('heading', {
            name: route === 'privacy' ? 'Privacy' : 'Terms',
            exact: true,
          }),
        ).toBeVisible();
        await expect(fresh.getByRole('heading', { name: 'Get started' })).toHaveCount(0);
        expect(await fresh.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      } finally {
        await fresh.close();
      }
    }
  });
}
