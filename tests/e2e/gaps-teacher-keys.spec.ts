import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.skip(process.env.LACUNA_BROWSER_SITE !== 'gaps', 'Requires the standalone Gaps build');

const shareId = 'a'.repeat(32);
const passphrase = 'several unrelated teacher words kept offline';

test('creates an encrypted file, restores it in a fresh browser and keeps learner storage separate', async ({
  page,
  browser,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (['xhr', 'fetch'].includes(request.resourceType())) requests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Set up or recover a teacher key' }).click();
  await expect(page.getByRole('heading', { name: 'Teacher key setup' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No courses connected' })).toBeVisible();
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([
    { name: 'lacuna.gaps.connections', version: 10 },
  ]);
  await page.getByLabel(/Published course link/).fill(`https://getlacuna.app/#/s/${shareId}`);
  await page.getByLabel(/^Recovery passphrase/).fill(passphrase);
  await page.getByLabel('Repeat recovery passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Prepare teacher key', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Teacher key saved', { timeout: 15_000 });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download encrypted recovery file' }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`gaps-teacher-${shareId}.json`);
  const text = await readFile((await download.path())!, 'utf8');
  const backup = JSON.parse(text);
  expect(backup.shareId).toBe(shareId);
  expect(text).not.toContain(passphrase);
  expect(text).not.toContain('privateKey');
  expect(
    (await page.evaluate(() => indexedDB.databases())).map((database) => database.name),
  ).toEqual(['lacuna.gaps.connections', 'lacuna.gaps.owner-keys']);
  await page.screenshot({ path: testInfo.outputPath('teacher-key-saved.png'), fullPage: true });
  await page.reload();
  await page.getByRole('button', { name: 'Set up or recover a teacher key' }).click();
  await page.getByLabel('Key action').selectOption('download');
  await page.getByLabel(/Published course link/).fill(shareId);
  await page.getByLabel('Recovery passphrase').fill(passphrase);
  await page.getByRole('button', { name: 'Open saved key' }).click();
  await expect(page.getByRole('status')).toContainText('Teacher key saved', { timeout: 15_000 });
  expect(requests).toEqual([]);

  const fresh = await browser.newContext({ viewport: { width: 390, height: 900 } });
  try {
    const restored = await fresh.newPage();
    const freshRequests: string[] = [];
    restored.on('request', (request) => {
      if (['xhr', 'fetch'].includes(request.resourceType())) freshRequests.push(request.url());
    });
    await restored.goto(new URL('/', page.url()).href);
    await restored.getByRole('button', { name: 'Set up or recover a teacher key' }).click();
    await restored.getByLabel('Key action').selectOption('restore');
    await restored.getByLabel(/Encrypted recovery file/).setInputFiles({
      name: 'teacher.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text),
    });
    await restored.getByLabel('Recovery passphrase').fill('wrong phrase');
    await restored.getByRole('button', { name: 'Restore teacher key' }).click();
    await expect(restored.getByRole('alert')).toContainText('Could not open the teacher key', {
      timeout: 15_000,
    });
    await expect(restored.getByRole('heading', { name: 'No courses connected' })).toBeVisible();
    expect(await restored.evaluate(() => indexedDB.databases())).toEqual([
      { name: 'lacuna.gaps.connections', version: 10 },
    ]);
    await restored.getByLabel('Recovery passphrase').fill(passphrase);
    await restored.getByRole('button', { name: 'Restore teacher key' }).click();
    await expect(restored.getByRole('status')).toContainText('Teacher key saved', {
      timeout: 15_000,
    });
    await expect(
      restored.getByText(backup.recovery.recipient.keyId, { exact: true }),
    ).toBeVisible();
    await expect(restored.getByText(/The course is not connected yet/)).toBeVisible();
    expect(await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(freshRequests).toEqual([]);
    await restored.screenshot({
      path: testInfo.outputPath('teacher-key-restored-mobile.png'),
      fullPage: true,
    });
  } finally {
    await fresh.close();
  }
});
