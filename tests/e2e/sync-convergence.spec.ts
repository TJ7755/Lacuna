import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { installStatefulSyncRelay, SYNC_CHANNEL_ID, SYNC_PASSPHRASE } from './fixtures/syncRelay';

async function addCard(page: Page, courseId: string, front: string) {
  await page.goto(`/#/course/${courseId}/cards`);
  await page
    .getByRole('group', { name: 'Add content' })
    .getByRole('button', { name: 'New card' })
    .click();
  await page.getByRole('textbox', { name: 'Front' }).fill(front);
  await page.getByRole('textbox', { name: 'Back' }).fill(`${front} answer`);
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/cards$`));
  await expect(page.getByText(front, { exact: true }).last()).toBeVisible();
}

async function syncNow(page: Page) {
  await page.goto('/#/settings');
  const button = page.getByRole('button', { name: 'Sync now', exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await button.click();
  await expect(button).toBeEnabled({ timeout: 30_000 });
}

test('two browser profiles preserve both additions after colliding relay writes', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000);
  await enterFreshLacuna(page);
  await createCourse(page, 'Concurrent revision');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
  const relay = await installStatefulSyncRelay(page);
  await page.goto('/#/settings');
  await page.locator('#settings-sync').getByRole('button', { name: 'Set up sync' }).click();
  await page.getByLabel('Relay URL', { exact: true }).fill(relay.relayBase);
  await page
    .getByLabel('Relay mint secret (private relays only)', { exact: true })
    .fill('test-mint-secret');
  await page.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await page.getByLabel('Confirm recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
  await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
  await expect(page.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

  const peerContext = await browser.newContext();
  try {
    const peer = await peerContext.newPage();
    await relay.attach(peer);
    await enterFreshLacuna(peer);
    await peer.goto('/#/settings');
    await peer
      .locator('#settings-sync')
      .getByRole('button', { name: 'Join another device' })
      .click();
    await peer.getByRole('tab', { name: 'Enter details' }).click();
    await peer.getByLabel('Relay URL', { exact: true }).fill(relay.relayBase);
    await peer.getByLabel('Channel id', { exact: true }).fill(SYNC_CHANNEL_ID);
    await peer.getByLabel('Recovery passphrase', { exact: true }).fill(SYNC_PASSPHRASE);
    await peer.getByRole('button', { name: 'Join channel' }).click();
    await expect(peer.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });

    let collisions = 0;
    for (const device of [page, peer]) {
      device.on('response', (response) => {
        if (response.url().endsWith('/state') && response.status() === 412) collisions += 1;
      });
    }
    relay.collideNextStateWrites();
    await Promise.all([
      addCard(page, courseId, 'Device A addition'),
      addCard(peer, courseId, 'Device B addition'),
    ]);
    await Promise.all([syncNow(page), syncNow(peer)]);
    await expect.poll(() => collisions, { timeout: 30_000 }).toBeGreaterThan(0);
    // The winning writer pulls again to receive the loser's merged successor.
    await syncNow(page);
    await syncNow(peer);
    for (const device of [page, peer]) {
      await device.goto(`/#/course/${courseId}/cards`);
      await device.reload();
      await expect(device.getByText('Device A addition', { exact: true })).toBeVisible();
      await expect(device.getByText('Device B addition', { exact: true })).toBeVisible();
    }
  } finally {
    await peerContext.close();
  }
});
