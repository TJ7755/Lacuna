import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function importedCards(page: Page) {
  return page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<
        Array<{ front: string; back: string; conceptId: string; primaryLessonId: string }>
      >((resolve, reject) => {
        const request = connection.transaction('cards').objectStore('cards').getAll();
        request.onsuccess = () =>
          resolve(
            request.result as Array<{
              front: string;
              back: string;
              conceptId: string;
              primaryLessonId: string;
            }>,
          );
        request.onerror = () => reject(request.error);
      });
    } finally {
      connection.close();
    }
  });
}

for (const width of [1280, 390]) {
  test(`imports reversed cards with non-destructive Undo and stable bounds at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await enterFreshLacuna(page);
    const before = (await importedCards(page)).length;
    await page.locator('main').getByRole('button', { name: 'Import', exact: true }).click();
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    const importer = page.locator('.card-import-page');
    await importer
      .getByLabel('Paste your cards')
      .fill('Import greeting\thello\n{{c1::Paris}} is in France');
    await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
    await importer.getByLabel('Course title').fill('Import regression');
    await importer.getByRole('radio', { name: /Steady retention/ }).check();
    await importer.getByRole('checkbox', { name: 'Also create reverse' }).check();
    await expect(importer.getByRole('button', { name: 'Import 3 cards' })).toBeEnabled();
    await importer.getByRole('button', { name: 'Undo' }).click();
    await expect(importer.getByLabel('Paste your cards')).toHaveValue(
      'Import greeting\thello\n{{c1::Paris}} is in France',
    );
    expect((await importedCards(page)).length).toBe(before);
    await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
    await expect(importer.getByRole('checkbox')).toBeChecked();
    await expect(importer.getByLabel('Course title')).toHaveValue('Import regression');
    await importer.getByRole('button', { name: 'Import 3 cards' }).click();
    await expect(importer).toBeHidden();
    await expect(page).toHaveURL(/\/lesson\//);
    await expect.poll(async () => (await importedCards(page)).length).toBe(before + 3);
    const added = await importedCards(page);
    const original = added.find((card) => card.front === 'Import greeting')!;
    expect(
      added.find((card) => card.front === 'hello' && card.back === 'Import greeting'),
    ).toMatchObject({ conceptId: original.conceptId, primaryLessonId: original.primaryLessonId });

    const dialog = page.getByRole('dialog', { name: 'Import cards', exact: true });

    // Import into this lesson as well: Undo must not remove the existing cards.
    await page.getByRole('button', { name: 'More ways to add cards' }).click();
    await page.getByRole('menuitem', { name: 'Import cards' }).click();
    await dialog.getByLabel('Paste your cards').fill('Second import\tretained');
    await expect(dialog).toHaveCSS('transform', 'none');
    const close = dialog.getByRole('button', { name: 'Close import' });
    const review = dialog.getByRole('button', { name: 'Review cards', exact: true });
    await review.focus();
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(review).toBeFocused();
    const first = await dialog.boundingBox();
    await dialog.getByRole('button', { name: 'Review cards', exact: true }).click();
    expect(await dialog.boundingBox()).toEqual(first);
    await dialog.getByRole('button', { name: 'Undo' }).click();
    expect((await importedCards(page)).length).toBe(before + 3);
    await dialog.getByRole('button', { name: 'Review cards', exact: true }).click();
    await dialog.getByRole('button', { name: 'Import 1 cards' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await importedCards(page)).length).toBe(before + 4);
  });
}
