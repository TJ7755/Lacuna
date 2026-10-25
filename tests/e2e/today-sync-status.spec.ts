import { expect, test, type Page } from '@playwright/test';
import type { SyncState } from '../../src/db/types';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

async function setSyncState(page: Page, state: SyncState) {
  await page.evaluate(async (value) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('appState', 'readwrite');
        transaction.objectStore('appState').put({ key: 'syncState', value });
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      };
    });
  }, state);
  await page.reload();
}

for (const width of [1280, 390]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`Today sync stays compact and accessible at ${width}px in ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
      await enterWithWelcomeCourse(page);
      const paired = { channelId: 'channel', lastSuccessfulSyncAt: Date.now() };

      for (const state of [
        paired,
        { ...paired, lastError: 'Network unavailable' },
        { channelId: 'channel' },
      ]) {
        await setSyncState(page, state);
        const link = page.getByRole('link', { name: /Open sync$/ });
        await expect(link).toBeVisible();
        await expect(link).toHaveAttribute('href', '#/settings');
        const stats = await page.getByLabel(/^Today: \d+ cards/).boundingBox();
        const bounds = await link.boundingBox();
        expect(
          Math.abs(bounds!.y + bounds!.height / 2 - stats!.y - stats!.height / 2),
        ).toBeLessThan(1);
        expect(bounds!.width).toBeLessThan(180);
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
          false,
        );

        if ('lastError' in state) {
          await expect(link.getByText('Sync failed', { exact: true })).toBeVisible();
          await expect(link).toHaveAccessibleName(/Synced .+ · Sync failed · Open sync/);
        } else if (!('lastSuccessfulSyncAt' in state)) {
          await expect(link.getByText('Not yet synced', { exact: true })).toBeVisible();
        } else {
          await expect(link).toHaveAccessibleName(/Synced .+ · Open sync/);
          if (width === 390) await expect(link.getByText(/^Synced/)).toBeHidden();
        }
      }

      const link = page.getByRole('link', { name: 'Not yet synced · Open sync' });
      await link.focus();
      await expect(link).toBeFocused();
      expect(await link.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
        'none',
      );
      await link.press('Enter');
      await expect(page).toHaveURL(/#\/settings$/);
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    });
  }
}
