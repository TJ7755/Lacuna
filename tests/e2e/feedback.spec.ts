import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ serviceWorkers: 'block' });

test('Settings and Help embed feedback only after a deliberate action', async ({
  page,
}, testInfo) => {
  const formId = (process.env.VITE_TALLY_FEEDBACK_FORM_ID ?? 'zEEkv1').trim();
  const requests: { url: string; referrer: string | undefined }[] = [];
  await page.route('https://tally.so/**', async (route) => {
    requests.push({ url: route.request().url(), referrer: route.request().headers().referer });
    await route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="en-GB"><body><label>Message<textarea></textarea></label><button>Submit feedback</button></body></html>',
    });
  });
  await enterFreshLacuna(page);
  for (const destination of ['Settings', 'Help']) {
    await page.getByRole('link', { name: destination, exact: true }).first().click();
    await expect(page.getByRole('heading', { name: destination, exact: true })).toBeVisible();
    if (destination === 'Help') {
      await page.getByRole('searchbox', { name: 'Search help' }).fill('no-matching-help-topic');
      await expect(page.getByText('No matching topics.')).toBeVisible();
    }
    const open = page.getByRole('button', { name: 'Send feedback', exact: true });
    if (!formId || !/^[a-zA-Z0-9]+$/.test(formId)) {
      await expect(open).toHaveCount(0);
      continue;
    }
    await expect(open).toBeVisible();
    await expect(page.locator('iframe[title="Send feedback"]')).toHaveCount(0);
    const countBefore = requests.length;
    await open.focus();
    await open.press('Enter');
    const frame = page.frameLocator('iframe[title="Send feedback"]');
    await expect(frame.getByRole('textbox', { name: 'Message' })).toBeVisible();
    await expect(page.locator('iframe[title="Send feedback"]')).toHaveAttribute(
      'credentialless',
      '',
    );
    await expect(page.getByRole('link', { name: 'open it in a new tab' })).toHaveAttribute(
      'href',
      `https://tally.so/r/${formId}`,
    );
    expect(requests.slice(countBefore)).toEqual([
      { url: `https://tally.so/embed/${formId}?alignLeft=1&hideTitle=1`, referrer: undefined },
    ]);
    await frame.getByRole('textbox', { name: 'Message' }).fill('The test date was confusing.');
    await page.screenshot({
      path: testInfo.outputPath(`${destination.toLowerCase()}-feedback.png`),
    });
    await page.getByRole('button', { name: 'Close feedback' }).click();
    await expect(page.locator('iframe[title="Send feedback"]')).toHaveCount(0);
    await expect(open).toBeFocused();
  }
});
