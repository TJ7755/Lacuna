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
    await page.getByRole('button', { name: 'Connect a class' }).click();
    await page.getByLabel(/^Encrypted connection file/).setInputFiles({
      name: 'gaps-course.json',
      mimeType: 'application/json',
      buffer: Buffer.from(file),
    });
    await page.getByLabel('Connection passphrase', { exact: true }).fill('wrong phrase');
    await page.getByRole('button', { name: 'Verify and connect' }).click();
    await expect(page.getByRole('alert')).toContainText('passphrase');
    expect(requests).toEqual([]);
    await expect(page.getByLabel('Connection passphrase', { exact: true })).toHaveValue('');
    await page.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await page.getByRole('button', { name: 'Verify and connect' }).click();
    await expect(page.getByRole('heading', { name: 'GCSE Biology' })).toBeVisible();
    await expect(page.getByRole('status')).toContainText('Class connected. Next, set up a code');
    await expect(page.getByRole('button', { name: 'Set up class', exact: true })).toBeVisible();
    expect(requests).toEqual(['HEAD']);
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
    await page.getByText('Class setup and connection', { exact: true }).click();
    await page.getByRole('button', { name: 'Set up or restore this class', exact: true }).click();
    await expect(page.getByText('GCSE Biology', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Published course link/)).toHaveCount(0);
    await page.getByLabel(/^Recovery passphrase/).fill(phrase);
    await page.getByLabel('Repeat recovery passphrase').fill(phrase);
    await page.getByRole('button', { name: 'Protect class reports', exact: true }).click();
    await expect(
      page.getByText('Class protected. Download its recovery file.', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Back to classes' }).click();
    await page.getByText('Class setup and connection', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove connection' }).click();
    await page.getByRole('button', { name: 'Keep connection' }).click();
    await expect(page.getByRole('heading', { name: 'GCSE Biology' })).toBeVisible();
    await page.getByRole('button', { name: 'Remove connection' }).click();
    await page.getByRole('button', { name: 'Remove from this browser' }).click();
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toBeVisible();
    expect(await store.get(`shares/${owner.shareId}/auth`)).not.toBeNull();
    expect((await page.evaluate(() => indexedDB.databases())).map((db) => db.name).sort()).toEqual([
      'lacuna.gaps.connections',
      'lacuna.gaps.owner-keys',
    ]);
    expect(requests).toEqual(['HEAD']);
  });
}
