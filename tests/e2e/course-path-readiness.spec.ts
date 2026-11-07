import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';

async function seedCourse(page: Page) {
  const fixture = await build({
    entryPoints: ['scripts/performance-heavy/fixture.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'LacunaHeavyFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.route('**/__path_fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Course path readiness</title>',
    }),
  );
  await page.goto('/__path_fixture');
  await page.addScriptTag({ content: fixture.outputFiles[0].text });
  await page.evaluate(async () => {
    await (
      window as unknown as {
        LacunaHeavyFixture: { seed(small: boolean): Promise<unknown> };
      }
    ).LacunaHeavyFixture.seed(true);
  });
}

test.use({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });

test('opens a course with an assessment and keeps forecasts available without workload cards', async ({
  page,
}, testInfo) => {
  await seedCourse(page);
  await page.addInitScript(() => {
    const state = window as typeof window & { __pathHistoryReads: number };
    state.__pathHistoryReads = 0;
    const indexGetAll = IDBIndex.prototype.getAll;
    IDBIndex.prototype.getAll = function (...args) {
      if (this.objectStore.name === 'reviewHistory') state.__pathHistoryReads += 1;
      return indexGetAll.apply(this, args);
    };
    const storeGetAll = IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll = function (...args) {
      if (this.name === 'reviewHistory') state.__pathHistoryReads += 1;
      return storeGetAll.apply(this, args);
    };
  });
  await page.goto('/#/course/heavy-course-0');
  await expect(page.getByRole('heading', { name: 'Heavy course 0', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Lessons', exact: true })).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Assessments' }).getByText('Final exam'),
  ).toBeVisible();
  const coursePath = await page.screenshot({ animations: 'disabled' });
  await expect(page.getByLabel('Estimated assessment workload')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __pathHistoryReads: number }).__pathHistoryReads,
    ),
  ).toBe(0);
  await testInfo.attach('Course Path', { body: coursePath, contentType: 'image/png' });

  await page
    .getByRole('navigation', { name: 'Course sections' })
    .first()
    .getByRole('link', { name: 'Progress', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Exam-day forecast', exact: true })).toBeVisible();

  await page.goto('/#/');
  await expect(
    page
      .getByRole('region', { name: 'Forecast and this week' })
      .getByRole('img', { name: 'Exam-day forecast', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Study Heavy course 0' })).toBeEnabled();
  const today = await page.screenshot({ animations: 'disabled', fullPage: true });
  await expect(page.getByLabel('Estimated assessment workload')).toHaveCount(0);
  await testInfo.attach('Today', { body: today, contentType: 'image/png' });
});
