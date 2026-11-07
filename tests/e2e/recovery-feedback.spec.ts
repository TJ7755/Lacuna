import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna, enterWithWelcomeCourse } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';
import type { BackupFile, Card } from '@lacuna/core/db/types';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('keeps the selected file and actionable error, then retries without choosing again', async ({
  page,
}) => {
  await enterWithWelcomeCourse(page);
  await page.goto('/#/settings#settings-export');
  const recovery = page.locator('#settings-export');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    recovery.getByRole('button', { name: 'Download full backup' }).click(),
  ]);
  const downloadedPath = await download.path();
  if (!downloadedPath) throw new Error('Backup download is missing.');
  const backup: BackupFile = JSON.parse(await readFile(downloadedPath, 'utf8'));
  await recovery.getByLabel('Recover this installation').setInputFiles({
    name: 'revision-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(recovery.getByRole('heading', { name: 'revision-backup.json' })).toBeVisible();
  await page.evaluate(() => {
    Reflect.set(window, 'refuseRecoveryWrite', true);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'cards' && Reflect.get(window, 'refuseRecoveryWrite')) {
        throw new DOMException('Storage is full. Free space and try again.', 'QuotaExceededError');
      }
      return Reflect.apply(put, this, args);
    };
  });
  await recovery.getByRole('button', { name: 'Add from backup' }).click();
  await expect(recovery.getByRole('alert')).toHaveText(
    'Your browser storage is full. Export a backup before removing unused content.',
  );
  await expect(recovery.getByRole('heading', { name: 'revision-backup.json' })).toBeVisible();
  await expect(recovery.getByRole('button', { name: 'Add from backup' })).toBeEnabled();
  await recovery.getByRole('alert').scrollIntoViewIfNeeded();
  await recovery.screenshot({
    path: test.info().outputPath('recovery-file-retained.png'),
    animations: 'disabled',
  });

  // Hold a real transaction in this disposable profile to observe the pending UI.
  await page.evaluate(async () => {
    Reflect.set(window, 'refuseRecoveryWrite', false);
    const connection = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = connection.transaction('cards', 'readwrite');
    let keepOpen = true;
    Reflect.set(window, 'releaseRecoveryLock', () => {
      keepOpen = false;
    });
    const keepAlive = () => {
      const request = transaction.objectStore('cards').get('__recovery_test_lock__');
      request.onsuccess = () => {
        if (keepOpen) keepAlive();
      };
    };
    transaction.oncomplete = () => connection.close();
    keepAlive();
  });
  try {
    await recovery.getByRole('button', { name: 'Add from backup' }).click();
    await expect(recovery.getByRole('button', { name: 'Adding…' })).toBeDisabled();
    await expect(recovery.getByRole('button', { name: 'Replace local data' })).toBeDisabled();
    await expect(recovery.getByRole('button', { name: 'Choose backup file' })).toBeDisabled();
    await expect(
      recovery.getByRole('button', { name: 'Choose backup from another device' }),
    ).toBeDisabled();
    await recovery.screenshot({
      path: test.info().outputPath('recovery-pending.png'),
      animations: 'disabled',
    });
  } finally {
    await page.evaluate(() => Reflect.get(window, 'releaseRecoveryLock')());
  }
  await expect(page.getByText('Backup added.', { exact: true })).toBeVisible();
  await expect(recovery.getByRole('heading', { name: 'revision-backup.json' })).toHaveCount(0);
  await expect(recovery.getByRole('alert')).toHaveCount(0);
  const cards = await readAll<Card>(page, 'cards');
  expect(cards.find((card) => card.id === backup.cards[0].id)?.front).toBe(backup.cards[0].front);
});

test('keeps the quota warning visible and leads to export without promising freed space', async ({
  page,
}) => {
  await page.addInitScript(() => {
    navigator.storage.estimate = async () => ({ usage: 90, quota: 100 });
  });
  await enterFreshLacuna(page);
  const notices = page.getByLabel('Notifications', { exact: true });
  await expect(notices).toContainText('Export a backup before removing unused content.');
  await expect(notices.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  await page.clock.install();
  await page.clock.runFor(9000);
  await expect(notices).toContainText('Storage is 90% full.');
  await page.screenshot({
    path: test.info().outputPath('quota-warning.png'),
    animations: 'disabled',
  });
  await notices.getByRole('button', { name: 'Open export' }).click();
  await expect(page).toHaveURL(/#\/settings#settings-export$/);
});

test('supports selecting the public quota ID when clipboard access is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Clipboard denied');
        },
      },
    });
  });
  await enterFreshLacuna(page);
  await page.goto('/#/settings#settings-jev');
  await page.getByRole('switch', { name: 'Mark my answers automatically' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Turn on', exact: true }).click();
  await page.getByRole('button', { name: 'Copy quota ID' }).click();
  await expect(page.getByText(/Select and copy the quota ID below/)).toBeVisible();
  const quota = page.getByLabel('Quota ID', { exact: true });
  expect(await quota.evaluate((element) => getComputedStyle(element).userSelect)).toBe('text');
  await quota.dblclick();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe(await quota.innerText());
  await page.screenshot({
    path: test.info().outputPath('quota-manual-copy.png'),
    animations: 'disabled',
  });
});

test('supports copying configuration text with a simulated read-only native bridge', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error('Clipboard denied');
        },
      },
    });
    Object.assign(window, {
      electronAPI: {
        isElectron: true,
        platform: 'darwin',
        mcp: {
          getStatus: async () => ({
            running: true,
            toolCount: 46,
            toolSurfaceVersion: 2,
            companion: { command: 'lacuna', args: ['--mcp-companion'] },
          }),
          getGrants: async () => [],
          getConnections: async () => [],
          onInvoke: () => () => {},
          onConsentRequest: () => () => {},
          onGrantNotice: () => () => {},
          onScopeResolutionRequest: () => () => {},
        },
      },
    });
  });
  await enterFreshLacuna(page);
  await page.goto('/#/settings#settings-mcp');
  const mcp = page.locator('#settings-mcp');
  await mcp.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect(
    page.getByText('Copy failed — select the configuration and copy it manually.'),
  ).toBeVisible();
  const configuration = mcp.getByLabel('MCP client configuration', { exact: true });
  expect(await configuration.evaluate((element) => getComputedStyle(element).userSelect)).toBe(
    'text',
  );
  await configuration.dblclick({ position: { x: 90, y: 24 } });
  expect(await page.evaluate(() => getSelection()?.toString())).not.toBe('');
  await page.screenshot({
    path: test.info().outputPath('configuration-manual-copy.png'),
    animations: 'disabled',
  });
});

test('offers recovery without guaranteeing that unverified edits were saved', async ({ page }) => {
  await enterFreshLacuna(page);
  // A fresh empty installation need not have an automatic restore point.
  // Create one so the injected formatter failure is exercised deterministically.
  await page.goto('/#/settings#settings-backups');
  await page.getByRole('button', { name: 'Save restore point', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore', exact: true }).first()).toBeVisible();
  await page.goto('/#/');
  await page.evaluate(() => {
    Date.prototype.toLocaleString = () => {
      throw new Error('Date formatting unavailable');
    };
  });
  await page.goto('/#/settings#settings-backups');
  await expect(page.getByRole('heading', { name: 'Something went wrong' })).toBeVisible();
  await expect(page.getByText(/Unsaved edits may be lost/)).toBeVisible();
  await expect(page.getByText(/Your data is saved locally and is safe/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Technical details' }).click();
  await expect(page.getByText('Date formatting unavailable', { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('error-boundary-recovery.png'),
    animations: 'disabled',
  });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
});
