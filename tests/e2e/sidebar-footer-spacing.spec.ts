import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const height of [900, 700]) {
  test(`sidebar footer keeps its controls together at ${height}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height });
    const gaps = process.env.LACUNA_BROWSER_SITE === 'gaps';
    if (gaps) await page.goto('/');
    else await enterFreshLacuna(page);
    const sidebar = page.getByRole('complementary');
    const more = sidebar.getByRole('navigation', { name: 'More', exact: true });
    const theme = sidebar.getByRole('button', { name: 'Toggle colour theme' });
    const collapse = sidebar.getByRole('button', { name: 'Collapse sidebar', exact: true });
    await expect(theme).toBeVisible();
    await expect
      .poll(async () => {
        const controls = (await theme.boundingBox())!;
        const links = (await more.boundingBox())!;
        return controls.y - (links.y + links.height);
      })
      .toBeLessThanOrEqual(12);
    expect(
      Math.abs((await theme.boundingBox())!.y - (await collapse.boundingBox())!.y),
    ).toBeLessThan(1);
    await page.screenshot({ path: testInfo.outputPath('expanded-footer.png') });

    await collapse.click();
    const expand = sidebar.getByRole('button', { name: 'Expand sidebar', exact: true });
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
    const themeBox = (await theme.boundingBox())!;
    const expandBox = (await expand.boundingBox())!;
    expect(expandBox.y).toBeGreaterThanOrEqual(themeBox.y + themeBox.height);
    expect(expandBox.y + expandBox.height).toBeLessThanOrEqual(height);
    await expand.click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(264);
    await expect
      .poll(async () => {
        const controls = (await theme.boundingBox())!;
        const links = (await more.boundingBox())!;
        return controls.y - (links.y + links.height);
      })
      .toBeLessThanOrEqual(12);
  });
}
