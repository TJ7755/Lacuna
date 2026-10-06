import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('short review periods fill their card with a compact daily strip', async ({
  page,
}, testInfo) => {
  await enterFreshLacuna(page);
  await page.goto('/#/analytics');
  const activity = page.getByRole('region', { name: 'Review activity', exact: true });
  await expect(activity).toBeVisible({ timeout: 15000 });
  for (const days of [30, 7]) {
    await page.getByRole('button', { name: `${days} days`, exact: true }).click();
    const grid = activity.getByRole('grid');
    const cells = grid.getByRole('gridcell');
    await expect(cells).toHaveCount(days);
    await expect
      .poll(async () => (await grid.boundingBox())!.width / (await activity.boundingBox())!.width)
      .toBeGreaterThan(0.9);
    await expect.poll(async () => (await grid.boundingBox())!.height).toBeLessThan(80);
    await cells.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(cells.nth(1)).toBeFocused();
    await expect
      .poll(() => cells.last().evaluate((element) => getComputedStyle(element).opacity))
      .toBe('1');
    await activity.screenshot({ path: testInfo.outputPath(`review-${days}-days.png`) });
  }
});
