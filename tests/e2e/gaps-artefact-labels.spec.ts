import { expect, test, type Page, type Route } from '@playwright/test';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { DEFAULT_RELAY_URL } from '../../src/sync/pairingConfig';
import { openSidebarItem } from './fixtures/gaps';

test.afterEach(() => {
  delete process.env.RELAY_INSIGHTS_ENABLED;
});

test.skip(process.env.LACUNA_BROWSER_SITE !== 'gaps', 'Requires the standalone Gaps build');

async function expectPurposes(page: Page) {
  await expect(page.getByRole('group', { name: /give .* pupils/i })).toHaveCount(1);
  await expect(page.getByRole('group', { name: /keep .* private .* reopen/i })).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [1100, 390]) {
  test(`keeps invitations separate from recovery through creation and restore at ${width}px`, async ({
    page,
    browser,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    process.env.RELAY_INSIGHTS_ENABLED = '1';
    const relay = new MemoryStore();
    const handle = createHandler(relay);
    const minted = await handle(new Request(`${DEFAULT_RELAY_URL}/shares`, { method: 'POST' }));
    expect(minted.status).toBe(201);
    const source = (await minted.json()) as { shareId: string };
    await relay.put(`shares/${source.shareId}/payload`, new TextEncoder().encode('course'), {
      exclusive: true,
    });
    await relay.put(
      `shares/${source.shareId}/meta`,
      new TextEncoder().encode(
        JSON.stringify({
          v: 1,
          lineageId: 'synthetic-course',
          revision: 1,
          publishedAt: Date.now(),
          byteSize: 6,
          courseName: 'Demonstration class',
        }),
      ),
      { exclusive: true },
    );
    const wire = async (route: Route) => {
      const request = route.request();
      const body = request.postDataBuffer();
      const headers = new Headers(request.headers());
      if (body) headers.set('Content-Length', String(body.length));
      const response = await handle(
        new Request(request.url(), {
          method: request.method(),
          headers,
          body: body ? new Uint8Array(body) : undefined,
        }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    };
    await page.context().route(`${DEFAULT_RELAY_URL}/**`, wire);
    await page.goto('/');
    await page.getByLabel('Course link or code').fill(source.shareId);
    await page.getByRole('button', { name: 'Create class', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Class created' })).toBeVisible();
    await expectPurposes(page);
    const code = await page.getByLabel('Recovery code', { exact: true }).innerText();
    await page.screenshot({
      path: testInfo.outputPath(`created-${width}.png`),
      animations: 'disabled',
    });
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download class recovery file' }).click();
    const download = await downloading;
    const recoveryPath = (await download.path())!;
    await page.getByRole('button', { name: 'Continue to class' }).click();
    await page.getByRole('tab', { name: 'Invite', exact: true }).click();
    await page.getByRole('button', { name: 'Publish class code' }).click();
    await expect(page.getByLabel('Class code', { exact: true })).toHaveValue(
      /^[0-9A-Z]{4}-[0-9A-Z]{4}$/,
    );
    await expectPurposes(page);
    const pupil = page.getByRole('group', { name: /give .* pupils/i });
    await expect(pupil.getByLabel('Pupil join link')).toHaveValue(/\/s\/GAPS1_/);
    await expect(pupil.getByLabel('Recovery code')).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`invite-${width}.png`),
      animations: 'disabled',
    });
    const fresh = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    try {
      await fresh.route(`${DEFAULT_RELAY_URL}/**`, wire);
      const restored = await fresh.newPage();
      await restored.goto(page.url());
      await openSidebarItem(restored, 'Recover a class');
      await expect(restored.getByLabel('Encrypted recovery file')).toBeVisible();
      await expectPurposes(restored);
      await restored.screenshot({
        path: testInfo.outputPath(`recovery-${width}.png`),
        animations: 'disabled',
      });
      await restored.getByLabel('Encrypted recovery file').setInputFiles(recoveryPath);
      await expect(
        restored
          .getByRole('group', { name: /keep .* private .* reopen/i })
          .getByLabel('Recovery code', { exact: true }),
      ).toBeVisible();
      await restored.getByLabel('Recovery code', { exact: true }).fill(code);
      await restored.getByRole('button', { name: 'Restore class access' }).click();
      await expect(
        restored.getByRole('heading', { name: 'Demonstration class', level: 1 }),
      ).toBeVisible();
      expect(
        await restored.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
    } finally {
      await fresh.close();
    }
  });
}
