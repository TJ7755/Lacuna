import { build } from 'esbuild';
import { expect, test } from '@playwright/test';

for (const workerBlocked of [false, true]) {
  test(
    workerBlocked
      ? 'keeps course estimates available when their worker cannot load'
      : 'opens a populated course without hydrating review logs on the renderer',
    async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
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
      if (workerBlocked) {
        await page.route('**/remainingWork.worker-*.js', (route) => route.abort());
      }
      await page.goto('/#/course/heavy-course-0');
      await expect(
        page.getByRole('heading', { name: 'Heavy course 0', exact: true }),
      ).toBeVisible();
      if (!workerBlocked)
        expect(
          await page.evaluate(
            () => (window as typeof window & { __pathHistoryReads: number }).__pathHistoryReads,
          ),
        ).toBe(0);
      await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeVisible();
      // Full response-time estimates still arrive; only their computation leaves the renderer.
      const workload = page.locator('[aria-label="Estimated assessment workload"]');
      await expect(workload).toBeVisible();
      await expect(workload).toContainText('Final exam: estimated remaining work');
      const historyReads = await page.evaluate(
        () => (window as typeof window & { __pathHistoryReads: number }).__pathHistoryReads,
      );
      if (workerBlocked) expect(historyReads).toBeGreaterThan(0);
      else expect(historyReads).toBe(0);
    },
  );
}
