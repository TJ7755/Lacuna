import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`confirms a 164-lesson import before its lesson list at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await openImport(page);
    const file = {
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: {
        v: 2,
        at: Date.now(),
        course: { n: 'Large biology', o: 0, c: 0, e: 0, um: 'open' },
        lessons: Array.from({ length: 164 }, (_, i) => ({
          n: `Biology lesson ${i + 1}`,
          notes: [],
          cards: [{ k: 0, f: `Question ${i + 1}`, b: 'Answer' }],
        })),
      },
    };
    await page.getByLabel('Import file', { exact: true }).setInputFiles({
      name: 'Large biology.lacuna',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    const preview = page.getByRole('heading', { name: 'Ready to import' });
    await expect(preview).toBeVisible();
    await preview.scrollIntoViewIfNeeded();
    await page.getByText('Steady retention', { exact: true }).click();
    await expect(page.getByRole('radio', { name: /Steady retention/ })).toBeChecked();
    const add = page.getByRole('button', { name: 'Add to my courses' });
    await expect(add).toBeInViewport();
    const first = page.getByText('Biology lesson 1', { exact: true });
    const actionBounds = (await add.boundingBox())!;
    expect(actionBounds.y + actionBounds.height).toBeLessThanOrEqual(
      (await first.boundingBox())!.y,
    );
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(add).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`import-action-${width}.png`) });
    await add.press('Enter');
    await expect(preview).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Large biology', exact: true })).toBeVisible();
  });
}
