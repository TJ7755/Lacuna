import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function restorePointCount(page: Page): Promise<number> {
  return page.evaluate(async () => {
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
  });
}

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
  await expect.poll(() => restorePointCount(page)).toBe(1);
  expect(
    await page.evaluate(() => (window as unknown as { uiBackupWrites: number }).uiBackupWrites),
  ).toBe(0);
});

test('runs the daily worker for the first time after an offline reload', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('test-enable-daily-worker')) {
      Object.defineProperty(window, 'Worker', { value: undefined });
    }
  });
  const workerUrls: string[] = [];
  page.on('worker', (worker) => workerUrls.push(worker.url()));
  await enterFreshLacuna(page);
  await expect.poll(() => restorePointCount(page)).toBe(1);
  expect(workerUrls.some((url) => url.includes('dailyBackup.worker-'))).toBe(false);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          if (
            (await cache.keys()).some((request) =>
              /\/assets\/dailyBackup\.worker-[^/]+\.js$/.test(new URL(request.url).pathname),
            )
          )
            return true;
        }
        return false;
      }),
    )
    .toBe(true);
  await page.evaluate(async () => {
    localStorage.setItem('test-enable-daily-worker', 'yes');
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = connection.transaction('backups', 'readwrite');
        transaction.objectStore('backups').clear();
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } finally {
      connection.close();
    }
  });
  try {
    await context.setOffline(true);
    await page.reload();
    await expect.poll(() => restorePointCount(page)).toBe(1);
    expect(workerUrls.filter((url) => url.includes('dailyBackup.worker-'))).toHaveLength(1);
  } finally {
    await context.setOffline(false);
  }
});

test('restores a daily snapshot offline before any import or export action', async ({
  page,
  context,
}) => {
  await enterFreshLacuna(page);
  await expect.poll(() => restorePointCount(page)).toBe(1);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.goto('/#/settings#settings-backups');
  await expect(page.getByRole('heading', { name: 'Restore points', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
  try {
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Restore', exact: true })
      .click();
    await expect(
      page.getByText('Data restored from the selected point.', { exact: true }),
    ).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
