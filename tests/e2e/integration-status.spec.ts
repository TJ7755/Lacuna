import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('sync read failure remains unavailable until a successful retry', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.evaluate(() => {
    localStorage.setItem('fixture.sync.unavailable', 'true');
    const get = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (key) {
      if (
        this.name === 'appState' &&
        key === 'syncState' &&
        localStorage.getItem('fixture.sync.unavailable') === 'true'
      ) {
        throw new DOMException('Controlled sync read failure', 'UnknownError');
      }
      return get.call(this, key);
    };
  });
  await page.goto('/#/settings#settings-sync');
  const sync = page.locator('#settings-sync');
  await expect(sync.getByRole('status')).toHaveText('Sync status unavailable.');
  await expect(sync.getByRole('button', { name: 'Pair', exact: true })).toHaveCount(0);
  await sync.screenshot({ path: testInfo.outputPath('sync-status-unavailable.png') });
  await page.evaluate(() => localStorage.removeItem('fixture.sync.unavailable'));
  await sync.getByRole('button', { name: 'Retry sync status' }).click();
  await expect(sync.getByRole('button', { name: 'Pair', exact: true })).toBeVisible();
  await expect(sync.getByText('Sync status unavailable.')).toHaveCount(0);
});

test('MCP distinguishes unknown status and confirms the client and capability', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Biology', false);
  // Controlled desktop API fixture: no native process, companion or model is contacted.
  await page.evaluate(() => {
    const grants: { courseId: string; scope: string; label: string; grantedAt: number }[] = [];
    const status = { running: true, toolCount: 46, toolSurfaceVersion: 2 };
    const subscribe = () => () => undefined;
    localStorage.setItem('fixture.mcp.status', 'loading');
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        isElectron: true,
        platform: 'darwin',
        mcp: {
          getStatus: async () => {
            const mode = localStorage.getItem('fixture.mcp.status');
            if (mode === 'error') throw new Error('Controlled IPC failure');
            if (mode === 'loading')
              return new Promise((resolve) => {
                window.addEventListener('fixture-mcp-ready', () => resolve(status), { once: true });
              });
            return status;
          },
          getGrants: async () => [],
          getConnections: async () => [
            {
              connectionId: 'client-42-long',
              name: 'Study assistant',
              connectedAt: 1,
              lastActivityAt: 1,
              grants,
            },
          ],
          grantConnection: async (
            connectionId: string,
            courseId: string,
            scope: string,
            label: string,
          ) => {
            localStorage.setItem(
              'fixture.mcp.grant',
              JSON.stringify({ connectionId, courseId, scope, label }),
            );
            grants.push({ courseId, scope, label, grantedAt: Date.now() });
          },
          onInvoke: subscribe,
          onConsentRequest: subscribe,
          onGrantNotice: subscribe,
          onScopeResolutionRequest: subscribe,
        },
      },
    });
  });
  await page.goto('/#/settings#settings-mcp');
  const mcp = page.locator('#settings-mcp');
  await expect(mcp.getByRole('status')).toHaveText('Reading MCP status…');
  await expect(mcp.getByText('Stopped', { exact: true })).toHaveCount(0);
  await expect(mcp.getByText('0 tools', { exact: true })).toHaveCount(0);
  await expect(mcp.getByText('No MCP clients connected.')).toHaveCount(0);
  await mcp.screenshot({ path: testInfo.outputPath('mcp-status-loading.png') });
  await page.evaluate(() => {
    localStorage.setItem('fixture.mcp.status', 'error');
    window.dispatchEvent(new Event('focus'));
  });
  await expect(mcp.getByRole('status')).toHaveText('MCP status unavailable.');
  await page.evaluate(() => window.dispatchEvent(new Event('fixture-mcp-ready')));
  await expect(mcp.getByRole('status')).toHaveText('MCP status unavailable.');
  await mcp.screenshot({ path: testInfo.outputPath('mcp-status-unavailable.png') });
  await page.evaluate(() => localStorage.setItem('fixture.mcp.status', 'ready'));
  await mcp.getByRole('button', { name: 'Retry MCP status' }).click();
  await expect(mcp.getByRole('status')).toHaveText('Running');
  await expect(mcp.getByText('46 tools')).toBeVisible();
  const row = mcp
    .locator('div.flex.flex-wrap')
    .filter({ has: page.getByText('Biology', { exact: true }) })
    .last();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(mcp.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  await expect(
    mcp.getByText('Allow Study assistant (client-4) to read, create and edit content — Biology?'),
  ).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fixture.mcp.grant'))).toBeNull();
  await mcp.screenshot({ path: testInfo.outputPath('mcp-permission-confirmation.png') });
  await mcp.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row.getByRole('button', { name: 'Edit', exact: true })).toBeFocused();
  await mcp.getByRole('button', { name: 'Access permissions' }).click();
  await expect(
    mcp.getByText('Delete: read, create, edit, delete or bulk-change content'),
  ).toBeVisible();
  await mcp.screenshot({ path: testInfo.outputPath('mcp-permission-info.png') });
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await mcp.getByRole('button', { name: 'Allow', exact: true }).click();
  await expect(row.getByText('Edit access', { exact: true })).toBeVisible();
  const captured = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fixture.mcp.grant') ?? 'null'),
  );
  expect(captured).toMatchObject({
    connectionId: 'client-42-long',
    scope: 'write',
    label: 'Biology',
  });
});
