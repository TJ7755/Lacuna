import { expect, test } from '@playwright/test';
import { usageBatchSchema, type UsageBatch } from '@lacuna/protocol/usage';
import { createUsageHandler } from '../../apps/relay/src/usageAnalytics';
import { MemoryStore } from '../../apps/relay/src/store';

const SITE = 'https://getlacuna.app';
const RELAY = 'https://relay.getlacuna.app';

test.use({ serviceWorkers: 'block' });

test('a hosted learner controls the complete analytics flow', async ({
  context,
  page,
  baseURL,
}, info) => {
  const secret = 'test-only-dashboard-key-32-characters';
  const previousSecret = process.env.USAGE_ANALYTICS_ADMIN_SECRET;
  process.env.USAGE_ANALYTICS_ADMIN_SECRET = secret;
  const store = new MemoryStore();
  const handle = createUsageHandler(store);
  const readPublished = createUsageHandler(store, () => Date.now() + 3 * 86_400_000);
  const requests: UsageBatch[] = [];
  const legacy: string[] = [];
  try {
    await context.route(`${SITE}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/_vercel/')) {
        legacy.push(url.pathname);
        return route.abort();
      }
      await route.fulfill({
        response: await route.fetch({ url: `${baseURL}${url.pathname}${url.search}` }),
      });
    });
    await context.route('https://*.simpleanalyticscdn.com/**', async (route) => {
      legacy.push(route.request().url());
      await route.abort();
    });
    await context.route(`${RELAY}/usage/**`, async (route) => {
      const request = route.request();
      const headers = await request.allHeaders();
      const body = request.postData() ?? undefined;
      if (request.method() === 'POST') {
        expect(headers.cookie).toBeUndefined();
        expect(headers.referer).toBeUndefined();
        expect(body).not.toContain('private-search-fixture');
        requests.push(usageBatchSchema.parse(JSON.parse(body!)));
      }
      const response = await handle(
        new Request(request.url(), { method: request.method(), headers, body }),
      );
      expect(response).toBeDefined();
      await route.fulfill({
        status: response!.status,
        headers: Object.fromEntries(response!.headers),
        body: await response!.text(),
      });
    });

    await page.goto(`${SITE}/`);
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    const choice = page.getByRole('dialog', { name: 'Usage analytics' });
    await expect(choice.getByRole('radio', { name: 'On', exact: true })).toBeChecked();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    expect(requests).toHaveLength(0);
    await info.attach('Usage analytics choice', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await choice.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(choice).toBeHidden();
    await page.getByRole('button', { name: 'Exit' }).click();
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await page.goto(`${SITE}/#/search`);
    await page.getByRole('combobox', { name: 'Search content' }).fill('private-search-fixture');
    await expect(page.getByText(/Nothing matches/)).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect
      .poll(() => requests.flatMap(({ rows }) => rows.map(([key]) => key)))
      .toContain('action/search/search-used');

    const otherTab = await context.newPage();
    await otherTab.goto(`${SITE}/#/settings#settings-usage-analytics`);
    const setting = otherTab.getByRole('switch', { name: 'Usage analytics' });
    await expect(setting).toBeChecked();
    await setting.click();
    await expect(setting).not.toBeChecked();
    await page.bringToFront();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Search content' })).toBeVisible();
    await expect(choice).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('lacuna.usageAnalytics'))).toBe('0');
    expect(legacy).toEqual([]);

    const dashboard = await readPublished(
      new Request(`${RELAY}/usage/dashboard`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`analytics:${secret}`).toString('base64')}`,
        },
      }),
    );
    expect(dashboard?.status).toBe(200);
    const html = await dashboard!.text();
    expect(html).toContain('<td>Search used</td><td>Search</td><td>Withheld</td>');
    expect(html).not.toContain('private-search-fixture');
    expect((await handle(new Request(`${RELAY}/usage/dashboard`)))?.status).toBe(401);
  } finally {
    if (previousSecret === undefined) delete process.env.USAGE_ANALYTICS_ADMIN_SECRET;
    else process.env.USAGE_ANALYTICS_ADMIN_SECRET = previousSecret;
  }
});
