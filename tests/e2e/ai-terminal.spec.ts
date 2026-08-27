import { expect, test } from '@playwright/test';

const SESSION_ID = 'AAAABBBBCCCCDDDDEEEE';
const PAIRING_CODE = 'AAAA-BBBB-CCCC-DDDD-EEEE';

test('enables AI and presents a terminal pairing instruction', async ({ page }) => {
  await page.route('https://lacuna-relay.vercel.app/ai/sessions', async (route) => {
    expect(route.request().method()).toBe('POST');
    const body = route.request().postDataJSON() as { browserPublicKey?: unknown };
    expect(body.browserPublicKey).toEqual(expect.any(String));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: SESSION_ID,
        pairingCode: PAIRING_CODE,
        browserToken: 'a'.repeat(64),
        expiresAt: Date.now() + 10 * 60_000,
      }),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Create your first course' }).click();
  await page.goto('/#/settings#settings-ai');
  await page.getByRole('switch', { name: 'Enable AI' }).click();

  await page.getByRole('button', { name: 'AI', exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'AI conversation' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect terminal' }).click();

  await expect(page.locator('p').getByText(PAIRING_CODE, { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Terminal instruction' })).toHaveValue(
    `Connect to Lacuna with code ${PAIRING_CODE}, then wait for messages until I ask you to disconnect.`,
  );
  await expect(page.getByRole('textbox', { name: 'Message AI' })).toBeDisabled();
});
