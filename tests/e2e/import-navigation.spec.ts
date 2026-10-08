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
    // Measure after the entrance animation settles, not part-way through it.
    await page.evaluate(() =>
      Promise.all(document.getAnimations().map((animation) => animation.finished)),
    );
    const position = async () => {
      const heading = await title.boundingBox();
      const bounds = await header.boundingBox();
      const scrollTop = await page.locator('main').evaluate((node) => node.scrollTop);
      return {
        x: heading!.x,
        y: heading!.y + scrollTop,
        contentTop: bounds!.y + bounds!.height + scrollTop,
      };
    };
    const initial = await position();
    // The title sits where other pages put theirs.
    await page.goto('/#/settings');
    const settingsTitle = page.getByRole('heading', { name: 'Settings', exact: true });
    await expect(settingsTitle).toBeVisible();
    await page.evaluate(() =>
      Promise.allSettled(document.getAnimations().map((animation) => animation.finished)),
    );
    expect((await settingsTitle.boundingBox())!.y).toBe(initial.y);
    await page.goBack();
    await expect(title).toBeVisible();
    for (const source of ['Lacuna course', 'Anki deck', 'Text or spreadsheet']) {
      await page.getByRole('button', { name: new RegExp(source) }).click();
      const back = page.getByRole('button', { name: 'Back to import sources', exact: true });
      await expect(back).toBeVisible();
      const backBounds = await back.boundingBox();
      const titleBounds = await title.boundingBox();
      // Back shares the title's row, on the right, instead of a row of its own above it.
      expect(backBounds!.x).toBeGreaterThan(titleBounds!.x + titleBounds!.width);
      expect(backBounds!.y).toBeLessThan(titleBounds!.y + titleBounds!.height);
      expect(backBounds!.y + backBounds!.height).toBeGreaterThan(titleBounds!.y);
      await expect.poll(position).toEqual(initial);
      await back.click();
      await expect(page.getByText('Drop a file here')).toBeVisible();
      await expect.poll(position).toEqual(initial);
    }
  });
}
