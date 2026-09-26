import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

let fixtureSource: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['scripts/performance-heavy/fixture.ts'],
    bundle: true, write: false, platform: 'browser', format: 'iife',
    globalName: 'LacunaHeavyFixture', define: { 'import.meta.env.DEV': 'false' },
  });
  fixtureSource = bundle.outputFiles[0].text;
});

test('bounds off-screen lesson rows and reveals later cards when scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  // Reuse the owned, small performance fixture without mounting the app during seeding.
  await page.route('**/__virtual_fixture', (route) => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Virtual list regression</title>',
  }));
  await page.goto('/__virtual_fixture');
  await page.addScriptTag({ content: fixtureSource });
  await page.evaluate(async () => {
    await (window as unknown as {
      LacunaHeavyFixture: { seed(small: boolean): Promise<unknown> };
    }).LacunaHeavyFixture.seed(true);
  });
  await page.goto('/#/course/heavy-course-0/cards');
  const rows = page.locator('[data-card-id]');
  await expect(rows.first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(22);

  const main = page.locator('main[data-route-path$="/cards"]');
  await main.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByText(
    'Recall item 0-1-99: explain the relationship between energy and motion.', { exact: true },
  )).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(22);

  await main.evaluate((element) => { element.scrollTop = 0; });
  await expect(page.getByText(
    'Recall item 0-0-0: explain the relationship between energy and motion.', { exact: true },
  )).toBeVisible();
  await page.getByPlaceholder('Search all cards…').fill('Recall item 0-1-99');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(rows.first().getByRole('button', { name: /^Card details:/ })).toHaveAttribute('aria-expanded', 'true');
});
