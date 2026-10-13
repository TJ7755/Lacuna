import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { installStatefulSyncRelay, SYNC_PASSPHRASE } from './fixtures/syncRelay';

for (const theme of ['light', 'dark']) {
  test(`pairing keeps corrections and private relay details usable in ${theme}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript((value) => {
      localStorage.setItem('lacuna-theme', value);
      localStorage.setItem('lacuna-font-scale', '1.3');
      localStorage.setItem('lacuna-font-scale-user-set', '1');
    }, theme);
    await enterFreshLacuna(page);
    const relay = await installStatefulSyncRelay(page);
    await page.goto('/#/settings#settings-sync');
    await page.getByRole('button', { name: 'Pair', exact: true }).click();
    await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
    const phrase = page.getByLabel('Recovery passphrase', { exact: true });
    await expect(phrase).toBeFocused();
    await expect(page.getByLabel('Relay URL', { exact: true })).toHaveCount(0);
    await phrase.fill(SYNC_PASSPHRASE);
    await page.keyboard.press('Tab');
    const confirmation = page.getByLabel('Confirm recovery passphrase', { exact: true });
    await expect(confirmation).toBeFocused();
    await confirmation.fill('a different recovery phrase');
    await page.keyboard.press('Enter');
    await expect(confirmation).toBeFocused();
    await expect(confirmation).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert')).toHaveText('The recovery passphrases do not match.');
    await confirmation.fill(SYNC_PASSPHRASE);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'Advanced: use a private relay' }).click();
    await page.getByLabel('Relay URL', { exact: true }).fill(relay.relayBase);
    await page
      .getByLabel('Relay mint secret (private relays only)', { exact: true })
      .fill('test-mint-secret');
    await page.getByRole('button', { name: 'Hide advanced' }).click();
    await page.getByRole('button', { name: 'Advanced: use a private relay' }).click();
    await expect(page.getByLabel('Relay URL', { exact: true })).toHaveValue(relay.relayBase);
    await expect(
      page.getByLabel('Relay mint secret (private relays only)', { exact: true }),
    ).toHaveValue('test-mint-secret');
    await page.getByRole('button', { name: 'Hide advanced' }).click();
    // Keep credential-bearing advanced fields out of the visual evidence.
    await expect(page.getByLabel('Relay URL', { exact: true })).toBeHidden();
    await testInfo.attach('pairing-form', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await page.getByRole('button', { name: 'Set up sync', exact: true }).click();
    await expect(page.getByText('Paired to a sync channel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Show pairing QR' })).toBeFocused();
    await expect(page.getByRole('dialog', { name: 'Pair this device' })).toHaveCount(0);
  });
}

test('manual pairing identifies the incorrect channel and supports keyboard cancellation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/settings#settings-sync');
  await page.getByRole('button', { name: 'Pair', exact: true }).click();
  await page.getByRole('button', { name: 'Join another device' }).click();
  await page.getByRole('radio', { name: 'Enter details' }).click();
  const channel = page.getByLabel('Channel id', { exact: true });
  await expect(channel).toBeFocused();
  await channel.fill('incorrect');
  await page.keyboard.press('Enter');
  await expect(channel).toBeFocused();
  await expect(channel).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('alert')).toHaveText(
    'Enter the 32-character channel id from your other device.',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Set up sync' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Pair this device' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pair', exact: true })).toBeFocused();
});
