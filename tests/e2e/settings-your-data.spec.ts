import { mkdir } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { BackupSnapshot } from '../../src/db/types';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';
import { SYNC_CHANNEL_ID, SYNC_WRITE_TOKEN } from './fixtures/syncRelay';

const evidence = 'artifacts/settings-your-data';

for (const width of [1440, 390]) {
  for (const theme of ['light', 'dark']) {
    test(`Your data at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
      await enterFreshLacuna(page);
      await expect.poll(async () => (await readAll(page, 'backups')).length).toBeGreaterThan(0);
      const [snapshot] = await readAll<BackupSnapshot>(page, 'backups');
      await page.evaluate(
        async ({ snapshot, channelId, writeToken }) => {
          await new Promise<void>((resolve, reject) => {
            const request = indexedDB.open('lacuna');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction(['backups', 'appState'], 'readwrite');
              const backups = transaction.objectStore('backups');
              backups.clear();
              const now = Date.now();
              for (let index = 0; index < 8; index++) {
                backups.put({ ...snapshot, id: index + 1, createdAt: now - index * 60_000 });
              }
              transaction.objectStore('appState').put({
                key: 'syncState',
                value: {
                  relayUrl: 'https://relay.getlacuna.app',
                  channelId,
                  wrappedKeyMaterial: 'aa'.repeat(162),
                  lastSuccessfulSyncAt: now - 26 * 60_000,
                  lastSnapshotBytes: 2_880_000,
                  lastSnapshotPlaintextBytes: 7_160_000,
                  remembered: { channelKeyHex: '12'.repeat(32), writeToken },
                },
              });
              transaction.onerror = () => reject(transaction.error);
              transaction.oncomplete = () => {
                database.close();
                resolve();
              };
            };
          });
        },
        { snapshot, channelId: SYNC_CHANNEL_ID, writeToken: SYNC_WRITE_TOKEN },
      );
      await page.goto('/#/settings#settings-sync');
      const sync = page.locator('#settings-sync');
      await expect(sync.getByText('Paired to a sync channel')).toBeVisible();
      const restore = page.locator('section.card-surface').filter({
        has: page.getByRole('heading', { name: 'Restore points', exact: true }),
      });
      await mkdir(evidence, { recursive: true });
      const phase = process.env.SETTINGS_DATA_SCREENSHOT_PHASE ?? 'after';
      for (const [name, card] of [
        ['sync', sync],
        ['restore-points', restore],
      ] as const) {
        const bounds = await card.boundingBox();
        // A tall baseline list must fit inside the app's scrolling main to capture the whole card.
        await page.setViewportSize({
          width,
          height: Math.max(1000, Math.ceil(bounds!.height) + 160),
        });
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: `${evidence}/${phase}-${name}-${width}-${theme}.png` });
        await page.setViewportSize({ width, height: 1000 });
      }
      if (phase === 'before') return;
      await expect(restore.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(3);
      const more = restore.getByRole('button', { name: 'More restore points' });
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await more.click();
      await expect(restore.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(8);
      await restore.getByRole('button', { name: 'Delete', exact: true }).last().click();
      await expect(restore.getByRole('button', { name: 'Delete restore point' })).toBeFocused();
      await restore.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(
        restore.getByRole('button', { name: 'Delete', exact: true }).last(),
      ).toBeFocused();
      await restore.getByRole('button', { name: 'Restore', exact: true }).last().click();
      const dialog = page.getByRole('alertdialog', { name: /^Go back to/ });
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await more.click();
      await expect(restore.getByRole('button', { name: 'Restore', exact: true })).toHaveCount(3);
      const details = sync.getByRole('button', { name: 'End-to-end encrypted' });
      await expect(details).toHaveAttribute('aria-expanded', 'false');
      await expect(
        sync.locator('[inert]').filter({ hasText: 'https://relay.getlacuna.app' }),
      ).toHaveCount(1);
      await details.click();
      await expect(sync.getByText(SYNC_CHANNEL_ID, { exact: true })).toBeVisible();
      await expect(sync.getByText(/2.88 MB encrypted.*7.16 MB before encryption/)).toBeVisible();
      await details.click();
      await sync.getByRole('button', { name: 'Lock', exact: true }).click();
      await expect(sync.getByLabel('Recovery passphrase', { exact: true })).toBeVisible();
      await sync.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(sync.getByText('Remove sync from this device?')).toBeVisible();
      await sync.getByRole('button', { name: 'Cancel', exact: true }).click();
      await sync.getByRole('button', { name: 'Delete channel', exact: true }).click();
      await expect(sync.getByText('Delete the shared channel everywhere?')).toBeVisible();
      await sync.getByRole('button', { name: 'Cancel', exact: true }).click();
      for (const card of [sync, restore]) {
        expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
    });
  }
}
