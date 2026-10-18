import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('commits the daily restore point without cloning its payload on the UI thread', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.assign(window, { uiBackupWrites: 0 });
    const add = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (...args) {
      if (this.name === 'backups') {
        (window as unknown as { uiBackupWrites: number }).uiBackupWrites += 1;
      }
      return Reflect.apply(add, this, args);
    };
  });
  await enterFreshLacuna(page);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const connection = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        try {
          return await new Promise<number>((resolve, reject) => {
            const request = connection.transaction('backups').objectStore('backups').count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
        } finally {
          connection.close();
        }
      }),
    )
    .toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { uiBackupWrites: number }).uiBackupWrites),
  ).toBe(0);
});
