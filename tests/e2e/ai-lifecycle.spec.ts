import { expect, test } from '@playwright/test';
import { AI_RELAY_SESSION_STORAGE_KEY } from '../../src/ai/session/relayPersistence.js';
import type { TerminalAiClient } from '../../tooling/lacuna-ai-mcp/src/client.js';
import { pairBrowserAndTerminal } from './fixtures/aiRelay.js';
import {
  installStatefulSyncRelay,
  SYNC_CHANNEL_ID,
  SYNC_PASSPHRASE,
} from './fixtures/syncRelay.js';

test('preserves AI across peer sync and revokes it after full replacement', async ({
  browser,
  page,
}) => {
  test.setTimeout(300_000);
  const { composer, terminal } = await pairBrowserAndTerminal(page);
  await composer.fill('Create a temporary course so sync can remove it.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const createRun = await terminal.waitForMessage(2_000);
  if (createRun.type !== 'message') throw new Error('Expected the course creation request.');

  const input = { name: 'Peer-deleted AI course' };
  const pending = await terminal.invokeTool(
    createRun.runId,
    'create-peer-course',
    'lacuna.create_course',
    input,
  );
  expect(pending).toMatchObject({
    ok: false,
    error: { kind: 'approval_required', approvalKind: 'write_call' },
  });
  await page.getByRole('button', { name: 'Approve' }).click();
  const created = await terminal.invokeTool(
    createRun.runId,
    'create-peer-course',
    'lacuna.create_course',
    input,
  );
  const courseId = successfulId(created);
  const memoryInput = {
    scope: { kind: 'global' as const },
    tags: ['preference'] as const,
    content: 'Prefer lifecycle examples with explicit evidence.',
    basis: 'learner-stated' as const,
  };
  const pendingMemory = await terminal.invokeTool(
    createRun.runId,
    'create-lifecycle-memory',
    'lacuna.create_memory',
    memoryInput,
  );
  expect(pendingMemory).toMatchObject({
    ok: false,
    error: { kind: 'approval_required', approvalKind: 'write_grant' },
  });
  await page.getByRole('button', { name: 'Approve' }).click();
  expect(
    await terminal.invokeTool(
      createRun.runId,
      'create-lifecycle-memory',
      'lacuna.create_memory',
      memoryInput,
    ),
  ).toMatchObject({ ok: true });
  const createdReply = 'The temporary course is ready.';
  await terminal.reply(createRun.runId, createRun.messageId, createdReply);
  await expect(page.getByText(createdReply, { exact: true })).toBeVisible();

  const syncRelay = await installStatefulSyncRelay(page);
  await page.goto('/#/settings#settings-sync');
  await page.locator('#settings-sync').getByRole('button', { name: 'Set up sync' }).click();
  await page.getByLabel('Relay URL', { exact: true }).fill(syncRelay.relayBase);
  await page
    .getByLabel('Relay mint secret (private relays only)', { exact: true })
    .fill('stub-mint-secret');
  await page.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await page.getByLabel('Confirm recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
  await expect(page.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  const peerContext = await browser.newContext();
  const peerPage = await peerContext.newPage();
  await syncRelay.attach(peerPage);
  await peerPage.goto('/');
  await peerPage.getByRole('button', { name: 'Create your first course' }).click();
  await peerPage.goto('/#/settings#settings-sync');
  await peerPage
    .locator('#settings-sync')
    .getByRole('button', { name: 'Join another device' })
    .click();
  await peerPage.getByRole('tab', { name: 'Enter details' }).click();
  await peerPage.getByLabel('Relay URL', { exact: true }).fill(syncRelay.relayBase);
  await peerPage.getByLabel('Channel id', { exact: true }).fill(SYNC_CHANNEL_ID);
  await peerPage.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await peerPage.getByRole('button', { name: 'Join channel' }).click();
  await expect(peerPage.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  await ensureAiPanelOpen(page);
  await composer.fill('Import enough cards to overlap the next focus-triggered sync.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const importRun = await terminal.waitForMessage(2_000);
  if (importRun.type !== 'message') throw new Error('Expected the import request.');
  const importInput = {
    courseId,
    items: Array.from({ length: 600 }, (_, index) => ({
      front: `Sync fence card ${index}`,
      back: `Evidence ${index}`,
    })),
  };
  const pendingImport = await terminal.invokeTool(
    importRun.runId,
    'import-during-sync',
    'lacuna.import_cards',
    importInput,
  );
  expect(pendingImport).toMatchObject({
    ok: false,
    error: { kind: 'approval_required', approvalKind: 'write_grant' },
  });
  await page.getByRole('button', { name: 'Approve' }).click();
  const stateWritesBeforeImport = countStateRequests(syncRelay.requests, 'PUT');
  const stateReadsBeforeImport = countStateRequests(syncRelay.requests, 'GET');
  const cardsBeforeImport = await cardCount(page);
  const importPromise = terminal.invokeTool(
    importRun.runId,
    'import-during-sync',
    'lacuna.import_cards',
    importInput,
    120_000,
  );
  await expect
    .poll(() => cardCount(page), { timeout: 30_000, intervals: [50] })
    .toBeGreaterThan(cardsBeforeImport);
  expect(await cardCount(page)).toBeLessThan(cardsBeforeImport + importInput.items.length);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect
    .poll(() => countStateRequests(syncRelay.requests, 'GET'), { timeout: 30_000 })
    .toBeGreaterThan(stateReadsBeforeImport);
  expect(await cardCount(page)).toBeLessThan(cardsBeforeImport + importInput.items.length);
  expect(countStateRequests(syncRelay.requests, 'PUT')).toBe(stateWritesBeforeImport);
  const imported = await importPromise;
  expect(imported).toMatchObject({ ok: true, result: { createdCount: 600 } });
  await terminal.reply(importRun.runId, importRun.messageId, 'The sync-fence import is complete.');
  await expect
    .poll(() => countStateRequests(syncRelay.requests, 'PUT'), { timeout: 30_000 })
    .toBeGreaterThan(stateWritesBeforeImport);

  await peerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await peerPage.goto(`/#/course/${courseId}/cards`);
  await peerPage.getByPlaceholder('Search all cards…').fill('Sync fence card 0');
  await expect(peerPage.getByText('Sync fence card 0', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await peerPage.goto('/#/settings#settings-ai');
  await expect(
    peerPage.getByText('Prefer lifecycle examples with explicit evidence.', { exact: true }),
  ).toBeVisible();
  await peerPage.getByRole('button', { name: 'Correct', exact: true }).click();
  const correctedMemory = 'Prefer lifecycle examples with visible sync evidence.';
  await peerPage.getByLabel('Correct memory').fill(correctedMemory);
  await peerPage.getByRole('button', { name: 'Save correction' }).click();

  await peerPage.goto(`/#/course/${courseId}/settings#course-settings-danger`);
  await peerPage.getByRole('button', { name: 'Delete course' }).click();
  await peerPage.getByRole('button', { name: 'Delete course' }).click();
  await expect(peerPage).toHaveURL(/\/#\/$/);
  const peerStateWrites = countStateRequests(syncRelay.requests, 'PUT');
  await peerPage.waitForTimeout(5_100);
  await peerPage.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect
    .poll(() => countStateRequests(syncRelay.requests, 'PUT'), { timeout: 30_000 })
    .toBeGreaterThan(peerStateWrites);
  await peerContext.close();

  await page.waitForTimeout(5_100);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.goto('/#/settings#settings-ai');
  await expect(page.getByText(correctedMemory, { exact: true })).toBeVisible({ timeout: 30_000 });
  await ensureAiPanelOpen(page);
  await expect(page.getByText('Playwright terminal', { exact: true })).toBeVisible();
  await expect(page.getByText(createdReply, { exact: true })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Completed action: Created Peer-deleted AI course' }),
  ).toContainText('Unavailable');
  await expect(page.getByRole('link', { name: 'Open course Peer-deleted AI course' })).toHaveCount(
    0,
  );

  const preservedComposer = page.getByRole('textbox', { name: 'Message AI' });
  await preservedComposer.fill('List the remaining courses.');
  await page.getByRole('button', { name: 'Send message' }).click();
  const readRun = await terminal.waitForMessage(2_000);
  if (readRun.type !== 'message') throw new Error('Expected the post-sync request.');
  const listed = await terminal.invokeTool(
    readRun.runId,
    'list-after-peer-sync',
    'lacuna.list_courses',
    {},
  );
  expect(listed.ok).toBe(true);
  const preservedReply = 'The terminal session survived peer sync.';
  await terminal.reply(readRun.runId, readRun.messageId, preservedReply);
  await expect(page.getByText(preservedReply, { exact: true })).toBeVisible();

  await page.goto('/#/settings#settings-export');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /^Full backup Complete database/ }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  if (!backupPath) throw new Error('Expected the full backup download to have a local path.');
  await page.getByLabel('Recover this installation').setInputFiles(backupPath);
  await page.getByRole('button', { name: 'Replace local data' }).click();
  await page.getByRole('button', { name: 'Replace local data' }).click();
  await expect(page.getByText('Data replaced from backup.')).toBeVisible();

  await ensureAiPanelOpen(page);
  await expect(page.getByRole('button', { name: 'Connect terminal' })).toBeVisible();
  await expect(page.getByText(createdReply, { exact: true })).toHaveCount(0);
  await expect(page.getByText(preservedReply, { exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
  expect(
    await page.evaluate(
      (storageKey) => localStorage.getItem(storageKey),
      AI_RELAY_SESSION_STORAGE_KEY,
    ),
  ).toBeNull();
  await expect(terminal.disconnect()).rejects.toThrow(/relay HTTP 404/i);
});

async function ensureAiPanelOpen(page: import('@playwright/test').Page): Promise<void> {
  const panel = page.getByRole('complementary', { name: 'AI conversation' });
  if (!(await panel.isVisible())) {
    await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  }
  await expect(panel).toBeVisible();
}

type TerminalToolResponse = Awaited<ReturnType<TerminalAiClient['invokeTool']>>;

async function cardCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('lacuna');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          try {
            const count = database.transaction('cards').objectStore('cards').count();
            count.onerror = () => {
              database.close();
              reject(count.error);
            };
            count.onsuccess = () => {
              database.close();
              resolve(count.result);
            };
          } catch (error) {
            database.close();
            reject(error);
          }
        };
      }),
  );
}

function countStateRequests(requests: readonly string[], method: 'GET' | 'PUT'): number {
  return requests.filter(
    (request) => request.startsWith(`${method} `) && request.endsWith('/state'),
  ).length;
}

function successfulId(response: TerminalToolResponse): string {
  expect(response.ok).toBe(true);
  if (!response.ok || !response.result || typeof response.result !== 'object') {
    throw new Error('Expected the course tool to return an object.');
  }
  const id = (response.result as Record<string, unknown>).id;
  if (typeof id !== 'string' || id === '') throw new Error('Expected a created Course id.');
  return id;
}
