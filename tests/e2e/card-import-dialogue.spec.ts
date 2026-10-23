import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

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
    await openImport(page);
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    const importer = page.locator('.card-import-panel');
    await importer
      .getByLabel('Paste your cards')
      .fill('Import greeting\thello\n{{c1::Paris}} is in France');
    await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
    await importer.getByRole('switch', { name: 'Also create reverse' }).click();
    await importer.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await importer.getByLabel('Course title').fill('Import regression');
    const steady = importer.getByRole('radio', { name: /Steady retention/ });
    await steady.focus();
    await steady.press('Space');
    await expect(steady).toBeChecked();
    await expect(importer.getByRole('button', { name: 'Import 3 cards' })).toBeEnabled();
    await importer.getByRole('button', { name: 'Back', exact: true }).click();
    await importer.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(importer.getByLabel('Paste your cards')).toHaveValue(
      'Import greeting\thello\n{{c1::Paris}} is in France',
    );
    expect((await importedCards(page)).length).toBe(before);
    await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
    await expect(importer.getByRole('switch', { name: 'Also create reverse' })).toBeChecked();
    await importer.getByRole('button', { name: 'Choose destination', exact: true }).click();
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

    // Import into this lesson as well: Undo must not remove the existing cards. Every way
    // to add cards starts from New card, with importing behind its further types.
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('button', { name: 'More card types', exact: true }).click();
    await page.getByRole('button', { name: 'Import cards', exact: true }).click();
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
    await dialog.getByRole('button', { name: 'Back', exact: true }).click();
    expect((await importedCards(page)).length).toBe(before + 3);
    await dialog.getByRole('button', { name: 'Review cards', exact: true }).click();
    await dialog.getByRole('button', { name: 'Import 1 card' }).click();
    await expect(dialog).toBeHidden();
    await expect.poll(async () => (await importedCards(page)).length).toBe(before + 4);
  });
}

for (const submitFrom of ['title', 'button']) {
  test(`completes the final import step with Enter from the ${submitFrom}`, async ({ page }) => {
    await enterFreshLacuna(page);
    const before = (await importedCards(page)).length;
    await openImport(page);
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    const importer = page.locator('.card-import-panel');
    const text = importer.getByLabel('Paste your cards');
    await text.fill('bonjour\thello');
    await text.press('End');
    await text.press('Enter');
    await expect(text).toHaveValue('bonjour\thello\n');
    await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
    await importer.getByRole('button', { name: 'Choose destination', exact: true }).click();
    const title = importer.getByLabel('Course title');
    const action = importer.getByRole('button', { name: 'Import 1 card' });
    await title.press('Enter');
    await expect(action).toBeDisabled();
    expect((await importedCards(page)).length).toBe(before);
    await title.fill('French vocabulary');
    await title.press('Tab');
    await expect(action).toBeFocused();
    await action.press('Shift+Tab');
    const back = importer.getByRole('button', { name: 'Back', exact: true });
    await expect(back).toBeFocused();
    await back.press('Shift+Tab');
    const steady = importer.getByRole('radio', { name: /Steady retention/ });
    await expect(steady).toBeFocused();
    await steady.press('ArrowLeft');
    const exam = importer.getByRole('radio', { name: /Exam date/ });
    await expect(exam).toBeChecked();
    await exam.press('Tab');
    await expect(importer.getByRole('button', { name: 'Exam date and time' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(exam).toBeFocused();
    await exam.press('ArrowRight');
    await expect(steady).toBeChecked();
    await steady.press('Shift+Tab');
    await expect(title).toBeFocused();
    await title.press('Shift+Tab');
    await expect(
      importer.getByRole('combobox', { name: 'Destination', exact: true }),
    ).toBeFocused();
    await title.focus();
    if (submitFrom === 'button') {
      await title.press('Tab');
      await expect(action).toBeFocused();
    }
    await page.keyboard.press('Enter');
    await expect(importer).toBeHidden();
    await expect.poll(async () => (await importedCards(page)).length).toBe(before + 1);
  });
}
