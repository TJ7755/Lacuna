import { expect, test } from '@playwright/test';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { sealGapsConnection } from '../../src/teacher/connectionFile';
import { DEFAULT_RELAY_URL } from '../../src/sync/pairingConfig';

test.skip(process.env.LACUNA_BROWSER_SITE !== 'gaps', 'Requires the standalone Gaps build');
const phrase = 'several separate words for the school trial';

for (const width of [1280, 390]) {
  test(`connects a verified course, survives reload and removes only its connection at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const store = new MemoryStore();
    const handle = createHandler(store);
    const minted = await handle(
      new Request(`${DEFAULT_RELAY_URL}/shares`, {
        method: 'POST',
        headers: { 'x-real-ip': '192.0.2.90' },
      }),
    );
    expect(minted.status).toBe(201);
    const owner = (await minted.json()) as { shareId: string; writeToken: string };
    const file = await sealGapsConnection(
      { ...owner, courseName: 'GCSE Biology', relayUrl: DEFAULT_RELAY_URL },
      phrase,
    );
    const requests: string[] = [];
    await page.route(`${DEFAULT_RELAY_URL}/**`, async (route) => {
      const request = route.request();
      requests.push(request.method());
      expect(request.url()).not.toContain(owner.writeToken);
      const response = await handle(
        new Request(request.url(), { method: request.method(), headers: request.headers() }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: '',
      });
    });
    await page.goto('/');
    const connect = page.getByRole('form', { name: 'Connect a class' });
    await connect.getByLabel('Connection file').setInputFiles({
      name: 'gaps-course.json',
      mimeType: 'application/json',
      buffer: Buffer.from(file),
    });
    await connect.getByLabel('Connection passphrase', { exact: true }).fill('wrong phrase');
    await connect.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(connect.getByRole('alert')).toContainText('passphrase');
    expect(requests).toEqual([]);
    await expect(connect.getByLabel('Connection passphrase', { exact: true })).toHaveValue('');
    await connect.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await connect.getByRole('button', { name: 'Connect', exact: true }).click();
    // A new class goes straight to protection, with its course already selected.
    await expect(page.getByRole('heading', { name: 'GCSE Biology', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Protect this class' })).toBeVisible();
    await expect(page.getByLabel('What do you need to do?')).toBeFocused();
    await expect(page.getByLabel(/^Published course link/)).toHaveCount(0);
    expect(requests).toEqual(['HEAD']);
    await page.screenshot({ path: testInfo.outputPath(`protect-class-${width}.png`) });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'GCSE Biology' })).toBeVisible();
    expect(requests).toEqual(['HEAD']);
    const persisted = await page.evaluate(
      () =>
        new Promise<string>((resolve, reject) => {
          const opening = indexedDB.open('lacuna.gaps.connections');
          opening.onerror = () => reject(opening.error);
          opening.onsuccess = () => {
            const database = opening.result;
            const read = database.transaction('connections').objectStore('connections').getAll();
            read.onsuccess = () => {
              database.close();
              resolve(JSON.stringify(read.result));
            };
            read.onerror = () => reject(read.error);
          };
        }),
    );
    expect(persisted).not.toContain(owner.writeToken);
    expect(persisted).not.toContain(phrase);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath(`connected-course-${width}.png`),
      fullPage: true,
    });

    // Opening a locked class asks for its passphrases in place; setup swaps in beside them.
    await page.getByRole('button', { name: 'Unlock GCSE Biology' }).click();
    const unlock = page.getByRole('form', { name: 'Unlock class' });
    await expect(unlock.getByLabel('Connection passphrase', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: 'First time? Set up' }).click();
    await expect(page.getByRole('heading', { name: 'Protect this class' })).toBeVisible();
    await page.getByLabel(/^Recovery passphrase/).fill(phrase);
    await page.getByLabel('Repeat recovery passphrase').fill(phrase);
    await page.getByRole('button', { name: 'Protect class reports', exact: true }).click();
    await expect(
      page.getByText('Class protected. Download its recovery file.', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Back to unlock' }).click();
    await expect(unlock.getByLabel('Connection passphrase', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: /^Class settings/ }).click();
    const settings = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: /^Class settings/ }) });
    await settings.getByRole('button', { name: 'Remove connection' }).click();
    await settings.getByRole('button', { name: 'Keep connection' }).click();
    await expect(settings.getByRole('button', { name: 'Remove connection' })).toBeVisible();
    await settings.getByRole('button', { name: 'Remove connection' }).click();
    await settings.getByRole('button', { name: 'Remove from this browser' }).click();
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
    expect(await store.get(`shares/${owner.shareId}/auth`)).not.toBeNull();
    expect((await page.evaluate(() => indexedDB.databases())).map((db) => db.name).sort()).toEqual([
      'lacuna.gaps.connections',
      'lacuna.gaps.owner-keys',
    ]);
    expect(requests).toEqual(['HEAD']);
  });
}
