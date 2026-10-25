import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const provider of ['external', 'hosted']) {
  test(`removes saved ${provider} chat access while keeping Jev marking`, async ({
    page,
  }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript((savedProvider) => {
      localStorage.setItem(
        'lacuna.aiSettings',
        JSON.stringify({
          enabled: true,
          provider: savedProvider,
          misconceptionFirstEnabled: true,
        }),
      );
      localStorage.setItem('lacuna.answerInput', 'type');
      localStorage.setItem('lacuna.studyMode', 'simple');
    }, provider);
    const requests: string[] = [];
    await page.route('**/api/ai/**', (route) => {
      const url = route.request().url();
      requests.push(url);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          url.endsWith('/session')
            ? { token: 'fixture-session', expiresAt: Date.now() + 3_600_000 }
            : { model: 'jev-1.14.0', value: 1, confidence: 0.99, inputTokens: 12 },
        ),
      });
    });
    await enterFreshLacuna(page);
    await page.goto('/#/settings#settings-jev');
    await expect(
      page.getByRole('heading', { name: 'Automatic marking', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Enable AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Built-in AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Assistant', exact: true })).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'AI conversation' })).toHaveCount(0);
    expect(requests).toEqual([]);

    await page.getByRole('switch', { name: 'Mark my answers automatically' }).click();
    await page.getByRole('checkbox', { name: /I understand/ }).check();
    await page.getByRole('button', { name: 'Turn on', exact: true }).click();
    await page
      .getByLabel('Access code')
      .fill('fixture-access-code-with-at-least-thirty-two-characters');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.getByLabel('Access code')).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Mark my answers automatically' })).toBeChecked();
    await info.attach('settings-with-jev-and-without-chat', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });

    await page.goto('/#/');
    await createCourse(page, 'Jev without chat');
    const courseId = new URL(page.url()).hash.split('/')[2];
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front', exact: true }).fill('What do plants absorb?');
    await page.getByRole('textbox', { name: 'Back', exact: true }).fill('Carbon dioxide');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.goto(`/#/course/${courseId}/learn`);
    await page.getByRole('textbox', { name: 'Your answer', exact: true }).fill('CO2');
    await page.getByRole('button', { name: 'Check answer', exact: true }).click();
    await expect(page.getByRole('main', { name: 'Session report' })).toBeVisible();
    expect(requests.filter((url) => url.endsWith('/jev'))).toHaveLength(1);
    expect(requests.some((url) => url.endsWith('/inference'))).toBe(false);
    await page.reload();
    await page.goto('/#/settings#settings-jev');
    await expect(page.getByRole('switch', { name: 'Mark my answers automatically' })).toBeChecked();
    await expect(page.getByLabel('Access code')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
  });
}
