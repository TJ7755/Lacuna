import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const dueOnly of [false, true]) {
  for (const grade of ['Again', 'Good'] as const) {
    test(`clears the last Practice cards without early repeats: ${grade}, due only ${dueOnly}`, async ({ page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await enterFreshLacuna(page);
      await createCourse(page, 'Practice queue');
      const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
      await page.getByRole('button', { name: 'Author mode' }).click();
      for (let index = 0; index < 3; index += 1) {
        await page.getByRole('button', { name: 'New card', exact: true }).click();
        await page.getByRole('textbox', { name: 'Front' }).fill(`Queue question ${index}`);
        await page.getByRole('textbox', { name: 'Back' }).fill(`Answer ${index}`);
        await page.getByRole('button', { name: 'Add card', exact: true }).click();
        await expect(page).not.toHaveURL(/\/cards\/new$/);
      }
      await page.evaluate(async (id) => {
        localStorage.setItem('lacuna.gradingMode', 'manual');
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('lacuna');
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const database = request.result;
            const transaction = database.transaction(['cards', 'courses', 'schedulingUnits'], 'readwrite');
            transaction.oncomplete = () => { database.close(); resolve(); };
            transaction.onerror = () => reject(transaction.error);
            for (const table of ['courses', 'schedulingUnits']) {
              const store = transaction.objectStore(table);
              const get = store.get(id);
              get.onsuccess = () => store.put({ ...get.result, learnFirst: false, examObjective: 'securedTopics' });
            }
            const store = transaction.objectStore('cards');
            const get = store.index('courseId').getAll(id);
            get.onsuccess = () => get.result.forEach((card, index) => store.put({
              ...card, state: 2, stability: 0.1 + index * 0.1, difficulty: 5,
              lastReviewed: Date.now() - 86_400_000, reps: 5, due: Date.now() - 1,
            }));
          };
        });
      }, courseId);
      await page.goto(`/#/course/${courseId}/learn${dueOnly ? '?filter=due' : ''}`);
      const progress = page.getByRole('progressbar', { name: 'Session progress' });
      await expect(progress).toHaveAttribute('aria-valuenow', '0');
      await expect(page.locator('header').getByText('0% complete')).toBeVisible();
      const seen = new Set<string>();
      for (let index = 0; index < 3; index += 1) {
        const face = page.locator('[data-study-card-id]');
        await expect(face).toHaveCount(1);
        const id = (await face.getAttribute('data-study-card-id'))!;
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
        await page.getByRole('button', { name: grade, exact: true }).click();
        if (index < 2) {
          await expect(progress).toHaveAttribute('aria-valuenow', String(Math.round((index + 1) / 3 * 100)));
          await expect(page.locator('[data-study-card-id]')).not.toHaveAttribute('data-study-card-id', id);
          if (index === 0) {
            await expect(page.locator('header').getByText('33% complete')).toBeVisible();
            for (const width of [1280, 390]) {
              await page.setViewportSize({ width, height: 800 });
              expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
              await page.screenshot({ path: testInfo.outputPath(`practice-progress-${width}.png`) });
            }
          }
        }
      }
      await expect(page.getByRole('heading', { name: 'Goal reached.' })).toBeVisible();
      await expect(page.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow', '100');
    });
  }
}
