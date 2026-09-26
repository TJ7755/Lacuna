import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [768, 1024, 1920]) {
  test(`analytics values remain accessible with enlarged text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await page.goto('/#/analytics');
    await expect(page.getByRole('heading', { name: 'Forecast' })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '150%';
    });
    const forecast = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Forecast', exact: true }) });
    await forecast.getByText('View data', { exact: true }).focus();
    await page.keyboard.press('Enter');
    const table = page.getByRole('table', { name: 'Forecast', exact: true });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader', { name: 'Due cards', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    await expect(table.getByRole('row')).toHaveCount(31);
  });
}

test('a card follows a held pointer without spring lag', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await enterFreshLacuna(page);
  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Cards', exact: true })
    .click();
  const row = page.locator('[data-card-id]').first();
  await expect(row).toBeVisible();
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error('Card bounds missing');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 100, bounds.y + bounds.height / 2);
  const offset = await row.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
  });
  expect(offset).toBeCloseTo(-100, 0);
  await page.mouse.up();
});

for (const width of [768, 1024]) {
  test(`course tabs and authoring remain usable at ${width}px with enlarged text`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await page.getByRole('heading', { name: 'Welcome to Lacuna', exact: true }).click();
    await page.getByRole('button', { name: 'Author mode', exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '150%';
    });
    const navigation = page.getByRole('navigation', { name: 'Course sections' });
    for (const name of ['Cards', 'Questions', 'Analytics', 'Settings', 'Path']) {
      await navigation.getByRole('link', { name, exact: true }).click();
      await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
    }
    await navigation.getByRole('link', { name: 'Cards', exact: true }).click();
    await page
      .getByRole('group', { name: 'Add content' })
      .getByRole('button', { name: 'New card', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'Front', exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Back', exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test('mouse lesson dragging carries the lesson and moves its neighbour aside', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await enterFreshLacuna(page);
  await page.getByRole('heading', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.getByRole('button', { name: 'Author mode', exact: true }).click();
  const lessons = page.locator('[aria-roledescription="sortable lesson"]');
  const first = lessons.nth(0);
  await first.scrollIntoViewIfNeeded();
  const firstName = await first.getAttribute('aria-label');
  const start = await first.boundingBox();
  const neighbour = await lessons.nth(1).boundingBox();
  if (!start || !neighbour || !firstName) throw new Error('Lesson bounds missing');
  const x = start.x + start.width / 2;
  const y = start.y + start.height / 2;
  const endY = neighbour.y + neighbour.height + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, endY);
  const held = await first.boundingBox();
  expect(held!.x - start.x).toBeCloseTo(20, 0);
  expect(held!.y - start.y).toBeCloseTo(endY - y, 0);
  expect((await lessons.nth(1).boundingBox())!.y).toBeLessThan(neighbour.y);
  await page.mouse.up();
  await expect(lessons.nth(1)).toHaveAttribute('aria-label', firstName);
});

test('populated analytics and rapid course navigation remain accessible', async ({
  page,
}, testInfo) => {
  const { build } = await import('esbuild');
  const { installLagProbe, readLagProbe } =
    await import('../../scripts/performance-heavy/diagnostics');
  const fixture = await build({
    entryPoints: ['scripts/performance-heavy/fixture.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'LacunaHeavyFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.route('**/__desktop_fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Desktop audit fixture</title>',
    }),
  );
  await page.goto('/__desktop_fixture');
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  await page.evaluate(async () => {
    await (
      window as unknown as { LacunaHeavyFixture: { seed(small: boolean): Promise<unknown> } }
    ).LacunaHeavyFixture.seed(true);
  });
  await page.addInitScript(installLagProbe);
  await page.goto('/#/analytics');
  const volume = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Review volume', exact: true }) });
  await volume.getByText('View data', { exact: true }).click();
  await expect(page.getByRole('table', { name: 'Review volume', exact: true })).toBeVisible();
  await expect(
    page.getByRole('table', { name: 'Review volume', exact: true }).getByRole('row'),
  ).toHaveCount(31);
  await page.goto('/#/course/heavy-course-0');
  const navigation = page.getByRole('navigation', { name: 'Course sections' });
  await expect(navigation).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __lacunaLag: { reset(): void } }).__lacunaLag.reset();
  });
  for (let round = 0; round < 3; round++) {
    for (const name of ['Cards', 'Questions', 'Settings', 'Analytics', 'Path']) {
      await navigation.getByRole('link', { name, exact: true }).click();
      await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expect(page.locator('[data-route-content]:not([inert])')).toHaveCount(1);
    }
  }
  const lag = await readLagProbe(page);
  const { writeFile } = await import('node:fs/promises');
  await writeFile(testInfo.outputPath('navigation-performance.json'), JSON.stringify(lag, null, 2));
});
