import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

// Regression for #453: Progress explains leeches and routes to the affected cards.
test('Leech count links to the leech cards it counts', async ({ page }) => {
  await enterFreshLacuna(page);
  await page.locator('main').getByRole('button', { name: 'Import', exact: true }).click();
  await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
  const importer = page.locator('.card-import-page');
  await importer.getByLabel('Paste your cards').fill('Stubborn fact\tanswer\nEasy fact\tanswer');
  await importer.getByRole('button', { name: 'Review cards', exact: true }).click();
  await importer.getByLabel('Course title').fill('Leech check');
  const steady = importer.getByRole('radio', { name: /Steady retention/ });
  await steady.focus();
  await steady.press('Space');
  await importer.getByRole('button', { name: 'Import 2 cards' }).click();
  await expect(page).toHaveURL(/\/lesson\//);

  // Reviewing a card into leech territory takes many sessions; set its lapses directly.
  await page.evaluate(async () => {
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const store = connection.transaction('cards', 'readwrite').objectStore('cards');
        const request = store.getAll();
        request.onsuccess = () => {
          const card = (request.result as { front: string; lapses: number }[]).find(
            (row) => row.front === 'Stubborn fact',
          )!;
          store.put({ ...card, lapses: 8 });
          store.transaction.oncomplete = () => resolve();
        };
        request.onerror = () => reject(request.error);
      });
    } finally {
      connection.close();
    }
  });

  await page.goto('/#/analytics');
  await page.reload();
  const leeches = page.locator('section', {
    has: page.getByRole('heading', { name: 'Leech count by course' }),
  });
  await expect(leeches).toContainText('Cards you keep forgetting.');
  await leeches.getByRole('link', { name: 'Show leech cards' }).click();
  await expect(page).toHaveURL(/#\/search\?filter=leech$/);
  await expect(page.getByText('Stubborn fact').first()).toBeVisible();
  await expect(page.getByText('Easy fact')).toHaveCount(0);
});
