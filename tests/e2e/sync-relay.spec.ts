import { expect, test, type Page } from '@playwright/test';

const CHANNEL_ID = '0123456789abcdef0123456789abcdef';
const WRITE_TOKEN = 'ab'.repeat(32);
const PASS_PHRASE = 'recovery-passphrase-1234';

/**
 * The browser's WebIDL `fetch` brand check cannot be exercised by vitest:
 * Node's undici fetch and `vi.fn` mocks accept any `this`. This spec drives
 * the real pairing UI in Chromium, so a captured `fetch` invoked with the
 * wrong `this` throws "Illegal invocation" before the request is dispatched
 * and the route below is never reached.
 *
 * The relay is stubbed at a same-origin loopback path: Lacuna accepts plain
 * HTTP only for loopback relays, and a same-origin target avoids CORS
 * preflights entirely so the test is hermetic without a stubbed CORS layer.
 * The assertions on the observed requests are what fail on the pre-fix code.
 */
async function stubRelay(page: Page, relayBase: string, requests: string[]): Promise<void> {
  const relayPath = new URL(relayBase).pathname;
  await page.route(`${relayBase}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const { pathname } = new URL(request.url());
    requests.push(`${method} ${request.url()}`);

    if (method === 'POST' && pathname === `${relayPath}/channel`) {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ channelId: CHANNEL_ID, writeToken: WRITE_TOKEN }),
      });
      return;
    }
    if (method === 'PUT' && pathname === `${relayPath}/c/${CHANNEL_ID}/keybag`) {
      await route.fulfill({ status: 204, headers: { ETag: '"keybag-1"' } });
      return;
    }
    if (method === 'PUT' && pathname === `${relayPath}/c/${CHANNEL_ID}/state`) {
      await route.fulfill({ status: 204, headers: { ETag: '"state-1"' } });
      return;
    }
    // A freshly minted channel has no written slots.
    await route.fulfill({ status: 404, body: '' });
  });
}

async function openSeededDashboard(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Study for the day that counts.' })).toBeVisible();
  await page.getByRole('button', { name: 'Create your first course' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

test('first-device sync setup completes against a stubbed relay', async ({ page }) => {
  const relayRequests: string[] = [];
  await openSeededDashboard(page);
  const relayBase = `${new URL(page.url()).origin}/relay`;
  await stubRelay(page, relayBase, relayRequests);

  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { name: 'Device sync' })).toBeVisible();

  await page.locator('#settings-sync').getByRole('button', { name: 'Set up sync' }).click();
  await page.getByLabel('Relay URL', { exact: true }).fill(relayBase);
  await page.getByLabel('Relay mint secret', { exact: true }).fill('stub-mint-secret');
  await page.getByLabel('Recovery passphrase', { exact: true }).fill(PASS_PHRASE);
  await page.getByLabel('Confirm recovery passphrase', { exact: true }).fill(PASS_PHRASE);
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();

  await expect(page.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  // The keybag and state writes must have reached the network layer; on the
  // pre-fix code the fetch call threw before dispatch and these were absent.
  expect(relayRequests).toContain(`POST ${relayBase}/channel`);
  expect(relayRequests).toContain(`PUT ${relayBase}/c/${CHANNEL_ID}/keybag`);
  expect(relayRequests).toContain(`PUT ${relayBase}/c/${CHANNEL_ID}/state`);
});
