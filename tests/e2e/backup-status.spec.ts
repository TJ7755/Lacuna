import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const mode of [
  'unconfigured',
  'saved',
  'permission-denied',
  'failed',
  'picker-failed',
] as const) {
  test(`separates the local restore point from a ${mode} folder copy`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((state) => {
      const directory = FileSystemDirectoryHandle.prototype;
      const getFileHandle = directory.getFileHandle;
      Object.defineProperties(directory, {
        queryPermission: {
          configurable: true,
          value: async () => (state === 'permission-denied' ? 'denied' : 'granted'),
        },
        requestPermission: {
          configurable: true,
          value: async () => (state === 'permission-denied' ? 'denied' : 'granted'),
        },
        getFileHandle: {
          configurable: true,
          value: function (
            this: FileSystemDirectoryHandle,
            name: string,
            options?: FileSystemGetFileOptions,
          ) {
            if (state === 'failed') throw new DOMException('Disk full', 'QuotaExceededError');
            return getFileHandle.call(this, name, options);
          },
        },
      });
      // A clonable native handle in this disposable profile avoids a real file-picker prompt.
      Object.defineProperty(window, 'showDirectoryPicker', {
        configurable: true,
        value: async () => {
          if (state === 'picker-failed') throw new DOMException('Unavailable', 'SecurityError');
          const root = await navigator.storage.getDirectory();
          return root.getDirectoryHandle('Lacuna backup test', { create: true });
        },
      });
    }, mode);
    await enterFreshLacuna(page);
    await page.goto('/#/settings#settings-backups');
    const local = page.locator('#settings-backups');
    if (mode === 'picker-failed') {
      await local.getByRole('button', { name: 'Choose folder' }).click();
      await expect(local.getByRole('alert')).toHaveText('Could not choose the folder. Try again.');
    } else if (mode !== 'unconfigured') {
      await local.getByRole('button', { name: 'Choose folder' }).click();
      await expect(local.getByText('Folder copy · Lacuna backup test')).toBeVisible();
    }
    await local.getByRole('button', { name: 'Save restore point' }).click();
    await expect(local.getByRole('button', { name: 'Saved', exact: true })).toBeVisible();
    await expect(local.getByText('Restore point saved just now')).toBeVisible();
    if (mode === 'saved') {
      await expect(local.getByRole('status')).toHaveText(/^Copied /);
    } else if (mode === 'permission-denied') {
      await expect(local.getByRole('alert')).toHaveText(
        'Folder permission needed. Choose the folder again.',
      );
    } else if (mode === 'failed') {
      await expect(local.getByRole('alert')).toHaveText(
        'Folder copy failed. Your restore point is saved.',
      );
    } else {
      await expect(local.getByText(/^Copied /)).toHaveCount(0);
    }
    const points = page.locator('section').filter({
      has: page.getByRole('heading', { name: 'Restore points', exact: true }),
    });
    await expect(points.getByLabel('0 questions').first()).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath(`backup-${mode}.png`),
      animations: 'disabled',
    });
    if (mode === 'saved') {
      const count = await page.evaluate(async () => {
        const root = await navigator.storage.getDirectory();
        const folder = await root.getDirectoryHandle('Lacuna backup test');
        let files = 0;
        for await (const entry of folder.values()) if (entry.kind === 'file') files += 1;
        return files;
      });
      expect(count).toBeGreaterThan(0);
    }
  });
}
