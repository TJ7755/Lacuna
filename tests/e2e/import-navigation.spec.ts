import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`keeps the import heading and content aligned through navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'Import', exact: true }).click();
    const title = page.getByRole('heading', { name: 'Import', exact: true });
    const header = page.locator('.import-page > header');
    await expect(title).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const position = async () => {
      const heading = await title.boundingBox();
      const bounds = await header.boundingBox();
      return { x: heading!.x, y: heading!.y, contentTop: bounds!.y + bounds!.height };
    };
    const initial = await position();
    for (const source of ['Lacuna course', 'Anki deck', 'Text or spreadsheet']) {
      await page.getByRole('button', { name: new RegExp(source) }).click();
      const back = page.getByRole('button', { name: 'Back', exact: true });
      await expect(back).toBeVisible();
      const backBounds = await back.boundingBox();
      const titleBounds = await title.boundingBox();
      expect(backBounds!.x).toBe(titleBounds!.x);
      expect(backBounds!.y + backBounds!.height).toBeLessThanOrEqual(titleBounds!.y);
      await expect.poll(position).toEqual(initial);
      await back.click();
      await expect(page.getByText('Drop a file here')).toBeVisible();
      await expect.poll(position).toEqual(initial);
    }
  });
}
