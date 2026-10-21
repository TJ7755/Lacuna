import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('the Add surface grows with enlarged text instead of clipping its label', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Large text course');
  await page.setViewportSize({ width: 390, height: 900 });
  await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
  const add = page
    .getByRole('group', { name: 'Add to path' })
    .getByRole('button', { name: 'Add', exact: true });
  await expect
    .poll(async () => {
      const [button, surface] = await Promise.all([
        add.boundingBox(),
        add.locator('..').boundingBox(),
      ]);
      return (
        button!.height <= surface!.height + 1 &&
        button!.width <= surface!.width + 1 &&
        button!.x >= surface!.x - 1
      );
    })
    .toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
