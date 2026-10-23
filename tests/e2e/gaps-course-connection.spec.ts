import { sealInsightEnvelope, type InsightsRecipient } from '../../src/insights/envelope';
import { completedIsoDayLabel, isoDayStartMs } from '../../relay/shared/insights/index';
import { expect, test } from '@playwright/test';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { sealGapsConnection } from '../../src/teacher/connectionFile';
import { openSidebarItem } from './fixtures/gaps';
import { formatClassCode } from '../../src/insights/classCode';
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
      if (request.url().includes('/insights/')) {
        expect(request.headers().authorization).toBe(`Bearer ${owner.writeToken}`);
        expect(reportEnvelope).toBeDefined();
        await route.fulfill({
          json: {
            v: 2,
            envelopes: [{ slotId: 'd'.repeat(32), envelope: reportEnvelope }],
            cursor: null,
          },
        });
        return;
      }
      const response = await handle(
        new Request(request.url(), { method: request.method(), headers: request.headers() }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Use a connection file' }).click();
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
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`protect-class-${width}.png`),
    });
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
      animations: 'disabled',
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
    await expect(
      unlock.getByRole('checkbox', { name: 'Remember this class on this device' }),
    ).toBeChecked();
    const recipient = await page.evaluate(
      (shareId) =>
        new Promise<InsightsRecipient>((resolve) => {
          const opening = indexedDB.open('lacuna.gaps.owner-keys');
          opening.onsuccess = () => {
            const database = opening.result;
            const read = database.transaction('owners').objectStore('owners').get(shareId);
            read.onsuccess = () => {
              database.close();
              resolve(read.result.recovery.recipient);
            };
          };
        }),
      owner.shareId,
    );
    const day = completedIsoDayLabel(Date.now());
    const reportEnvelope = await sealInsightEnvelope(
      recipient,
      new TextEncoder().encode(
        JSON.stringify({
          v: 1,
          shareId: owner.shareId,
          day,
          pupil: { id: 'e'.repeat(32), label: 'Synthetic pupil' },
          events: [
            {
              id: 'event',
              itemId: 'card',
              kind: 'card',
              at: isoDayStartMs(day),
              prompt: 'Membrane recall',
              answer: '',
              earned: null,
              available: null,
              retained: false,
              marking: 'recall',
              disputed: false,
              shortened: false,
              conceptIds: [],
              criteria: [],
            },
          ],
          omitted: 0,
        }),
      ),
      { shareId: owner.shareId, isoDay: day },
    );
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`unlock-${width}.png`),
      fullPage: true,
    });
    await unlock.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await unlock.getByLabel('Recovery passphrase', { exact: true }).fill(phrase);
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Synthetic pupil', exact: true })).toBeVisible();
    const header = page
      .locator('header')
      .filter({ has: page.getByRole('heading', { name: 'GCSE Biology', exact: true }) });
    const forgetTrigger = header.getByRole('button', { name: 'Forget on this device' });
    await expect(forgetTrigger).toBeVisible();
    await expect(header.getByRole('button', { name: 'Close', exact: true })).toHaveClass(
      (await forgetTrigger.getAttribute('class')) ?? '',
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`remembered-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Unlock GCSE Biology' }).click();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await expect(unlock).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Synthetic pupil', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Forget on this device' }).click();
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await expect(
      page.getByText(
        'This browser will ask for both passphrases next time. Your class, reports and recovery file are not affected.',
      ),
    ).toBeVisible();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`forget-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(forgetTrigger).toBeFocused();
    await page.getByRole('button', { name: 'Forget on this device' }).click();
    await page.getByRole('button', { name: 'Forget', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Unlock GCSE Biology' }).click();
    await expect(unlock).toBeVisible();
    await unlock.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await unlock.getByLabel('Recovery passphrase', { exact: true }).fill(phrase);
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
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
    expect(requests.filter((method) => method !== 'GET')).toEqual(['HEAD']);
    const rememberedCounts = await page.evaluate(async () => {
      const counts = [];
      for (const name of ['lacuna.gaps.connections', 'lacuna.gaps.owner-keys']) {
        counts.push(
          await new Promise<number>((resolve) => {
            const opening = indexedDB.open(name);
            opening.onsuccess = () => {
              const database = opening.result;
              const read = database.transaction('remembered').objectStore('remembered').count();
              read.onsuccess = () => {
                database.close();
                resolve(read.result);
              };
            };
          }),
        );
      }
      return counts;
    });
    expect(rememberedCounts).toEqual([0, 0]);
  });
}

for (const width of [1280, 390]) {
  test(`creates a private class from someone else's course link at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const store = new MemoryStore();
    const handle = createHandler(store);
    const minted = await handle(new Request(`${DEFAULT_RELAY_URL}/shares`, { method: 'POST' }));
    const source = (await minted.json()) as { shareId: string; writeToken: string };
    for (const [slot, text] of Object.entries({
      payload: 'publisher course',
      meta: JSON.stringify({
        v: 1,
        lineageId: 'biology',
        revision: 1,
        publishedAt: Date.now(),
        byteSize: 16,
        courseName: 'Shared biology',
      }),
    })) {
      await store.put(`shares/${source.shareId}/${slot}`, new TextEncoder().encode(text), {
        exclusive: true,
      });
    }
    await page.route(`${DEFAULT_RELAY_URL}/**`, async (route) => {
      const request = route.request();
      const response = await handle(
        new Request(request.url(), {
          method: request.method(),
          headers: request.headers(),
          body: request.postData() ?? undefined,
        }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
    const classResponse = await handle(
      new Request(`${DEFAULT_RELAY_URL}/shares`, {
        method: 'POST',
        body: JSON.stringify({ sourceShareId: source.shareId }),
      }),
    );
    const otherClass = (await classResponse.json()) as { shareId: string; writeToken: string };
    const code = formatClassCode({ shareId: otherClass.shareId, keyId: 'c'.repeat(64) });
    await page.addInitScript(() => {
      const random = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = <T extends ArrayBufferView<ArrayBuffer>>(array: T): T => {
        if (array instanceof Uint8Array && array.length === 24) {
          array.set(Array.from({ length: 24 }, (_, index) => index));
          return array;
        }
        return random(array) as T;
      };
    });
    await page.goto('/');
    await page
      .getByLabel('Course link or code')
      .fill(
        width === 390
          ? `https://getlacuna.app/#/s/${code}`
          : `https://getlacuna.app/#/s/${source.shareId}`,
      );
    await expect(
      page.getByRole('checkbox', { name: 'Remember this class on this device' }),
    ).toBeChecked();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`course-link-form-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('checkbox', { name: 'Remember this class on this device' }).uncheck();
    await page.getByRole('button', { name: 'Create class', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Class created' })).toBeFocused();
    await expect(page.getByRole('heading', { name: 'Connect your first class' })).toHaveCount(0);
    await expect(page.getByRole('group', { name: 'Class connection method' })).toHaveCount(0);
    const recovery = page.getByLabel('Recovery code');
    await expect(recovery.locator('span')).toHaveText(['0123-4567-89AB', 'CDEF-GHJK-MNPQ']);
    expect(
      await recovery.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
    ).toBeGreaterThanOrEqual(20);
    expect(await recovery.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await expect(page.getByRole('button', { name: 'Continue to class' })).toBeEnabled();
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`class-created-${width}.png`),
      fullPage: true,
    });
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download class recovery file', exact: true }).click();
    const download = await downloading;
    const { readFile } = await import('node:fs/promises');
    const { parseClassRecoveryFile } = await import('../../src/teacher/classRecoveryFile');
    const { openGapsConnection } = await import('../../src/teacher/connectionFile');
    const text = await readFile((await download.path())!, 'utf8');
    const saved = parseClassRecoveryFile(text);
    const recoveryCode = '0123456789ABCDEFGHJKMNPQ';
    const connection = await openGapsConnection(saved.connection, recoveryCode);
    expect(download.suggestedFilename()).toBe(`gaps-class-${connection.shareId}.json`);
    expect(text).not.toContain(recoveryCode);
    expect(connection.shareId).not.toBe(source.shareId);
    expect(connection.shareId).not.toBe(otherClass.shareId);
    expect(
      new TextDecoder().decode((await store.get(`shares/${connection.shareId}/source`))!.body),
    ).toBe(source.shareId);
    expect(connection.writeToken).not.toBe(source.writeToken);
    expect(text).not.toContain(connection.writeToken);
    expect(
      (await store.list(`shares/${connection.shareId}/`))
        .map(({ key }) => key.split('/').pop())
        .sort(),
    ).toEqual(['auth', 'source']);
    await page.getByRole('button', { name: 'Continue to class', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Shared biology' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Unlock class' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    const unlock = page.getByRole('form', { name: 'Unlock class' });
    await expect(unlock.getByLabel('Recovery code')).toBeVisible();
    await expect(page.getByRole('button', { name: 'First time? Set up' })).toHaveCount(0);
    await expect(page.getByLabel(/passphrase/)).toHaveCount(0);
    await page.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath(`recovery-code-unlock-${width}.png`),
      fullPage: true,
    });
    await unlock.getByLabel('Recovery code').fill('short');
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    await expect(unlock.getByRole('alert')).toHaveText(
      'Check the recovery code. It has 24 letters and numbers.',
    );
    await unlock.getByLabel('Recovery code').fill('z'.repeat(24));
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    await expect(unlock.getByRole('alert')).toBeVisible();
    await unlock.getByLabel('Recovery code').fill('o123-4567-89ab-cdef-ghjk-mnpq');
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    await expect(unlock).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Class settings/ }).click();
    await expect(
      page.getByRole('button', { name: 'Download class recovery file', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Download connection file', exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );

    // Removing the local connection simulates a fresh device without touching the relay.
    await page.getByRole('button', { name: 'Remove connection', exact: true }).click();
    await page.getByRole('button', { name: 'Remove from this browser', exact: true }).click();
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('lacuna.gaps.owner-keys');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    await openSidebarItem(page, width === 1280 ? 'Recover a class' : 'Today');
    if (width === 390) await page.getByRole('button', { name: 'Use a connection file' }).click();
    const fileLabel = width === 1280 ? 'Encrypted recovery file' : 'Connection file';
    await page.getByLabel(fileLabel, { exact: true }).setInputFiles({
      name: 'class.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await page.getByLabel('Recovery code', { exact: true }).fill(recoveryCode);
    await page
      .getByRole('button', {
        name: width === 1280 ? 'Restore class access' : 'Connect',
        exact: true,
      })
      .click();
    await expect(page.getByRole('heading', { name: 'Shared biology' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Unlock class' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeVisible();
  });
}
