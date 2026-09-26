import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('saves and imports course media on first use while offline', async ({ page, context }) => {
  await enterFreshLacuna(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Share', exact: true })
    .click();
  const share = page.locator('main[data-route-path="/share"]');
  await expect(share.getByRole('heading', { name: 'Share', exact: true })).toBeVisible();
  await share.getByRole('button', { name: /Welcome to Lacuna/ }).click();
  await expect(page.getByRole('button', { name: 'Save course file' })).toBeEnabled();

  await context.setOffline(true);
  try {
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save course file' }).click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toBe('Welcome to Lacuna.lacuna');
    const path = await download.path();
    if (!path) throw new Error('The course file was not downloaded.');
    const file = JSON.parse(await readFile(path, 'utf8'));
    expect(file.assets.length).toBeGreaterThan(0);
    file.payload.course.n = 'Offline imported course';

    // The recipient must recover media from the file, not find the sender's cached assets.
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const transaction = db.transaction('assets', 'readwrite');
            transaction.objectStore('assets').clear();
            transaction.oncomplete = () => {
              db.close();
              resolve();
            };
            transaction.onabort = () => {
              db.close();
              reject(transaction.error);
            };
          };
        }),
    );
    await page.getByLabel('Course file to import').setInputFiles({
      name: 'Offline course.lacuna',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
    await expect(page.getByText(/Offline imported course —/)).toBeVisible();
    await page.getByRole('button', { name: 'Add to my courses' }).click();
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
    await expect(share.getByRole('button', { name: /Offline imported course/ })).toBeVisible();
    const restored = await page.evaluate(
      (hash: string) =>
        new Promise<boolean>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const asset = db.transaction('assets').objectStore('assets').get(hash);
            asset.onsuccess = () => {
              db.close();
              resolve(!!asset.result?.blob);
            };
            asset.onerror = () => {
              db.close();
              reject(asset.error);
            };
          };
        }),
      file.assets[0].hash,
    );
    expect(restored).toBe(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  } finally {
    await context.setOffline(false);
  }
});
