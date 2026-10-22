import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [768, 1024, 1920]) {
  test(`analytics values remain accessible with enlarged text at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await page.goto('/#/analytics');
    await expect(page.getByRole('heading', { name: 'Workload ahead' })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '150%';
    });
    const forecast = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Workload ahead', exact: true }) });
    await forecast.getByText('View data', { exact: true }).focus();
    await page.keyboard.press('Enter');
    const table = page.getByRole('table', { name: 'Workload ahead', exact: true });
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
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '150%';
    });
    const navigation = page.getByRole('navigation', { name: 'Course sections' });
    for (const name of ['Cards', 'Questions', 'Settings', 'Path']) {
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
    await page.getByRole('button', { name: 'New card', exact: true }).click();
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
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
  const lessons = page.locator('[data-path-lesson] [aria-roledescription="sortable path row"]');
  const first = lessons.nth(0);
  await first.scrollIntoViewIfNeeded();
  const firstName = await first.getAttribute('aria-label');
  const start = await first.boundingBox();
  const neighbour = await lessons.nth(1).boundingBox();
  if (!start || !neighbour || !firstName) throw new Error('Lesson bounds missing');
  const centreX = start.x + start.width / 2;
  const centreY = start.y + start.height / 2;
  // PointerEvent coordinates are whole CSS pixels; retain the initial grab offset.
  const x = Math.round(centreX);
  const y = Math.round(centreY);
  const endY = Math.round(neighbour.y + neighbour.height + 10);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(first).toHaveAttribute('data-drag-lifted', 'true');
  const lifted = (await first.boundingBox())!;
  await page.mouse.move(x + 20, endY);
  const held = await first.evaluate(async (element) => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  expect(held.x + held.width / 2 - lifted.x - lifted.width / 2).toBeCloseTo(0, 0);
  expect(held.y + held.height / 2 - lifted.y - lifted.height / 2).toBeCloseTo(endY - y, 0);
  await expect.poll(async () => (await lessons.nth(1).boundingBox())!.y).toBeLessThan(neighbour.y);
  // The lesson's name sits inside the row, so it travels with it.
  await expect(first).toContainText('Core concepts & rendering');
  await page.mouse.up();
  await expect(lessons.nth(1)).toHaveAttribute('aria-label', firstName);
});

test('populated analytics and course navigation remain accessible', async ({ page }) => {
  const { build } = await import('esbuild');
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
  for (const name of ['Cards', 'Questions', 'Settings', 'Path']) {
    await navigation.getByRole('link', { name, exact: true }).click();
    await expect(navigation.getByRole('link', { name, exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('[data-route-content]:not([inert])')).toHaveCount(1);
  }
});
