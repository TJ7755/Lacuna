import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

test.use({ timezoneId: 'Europe/London' });

for (const width of [1280, 390]) {
  test(`asks for the learner's study target at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    await openImport(page);
    await page.getByLabel('Import file', { exact: true }).setInputFiles({
      name: 'Biology.lacuna',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({
        format: 'lacuna-course', version: 1, assets: [],
        payload: {
          v: 2, at: 1_700_000_000_000,
          course: { n: 'Biology scheduling', o: 0, c: 1000, e: 1_900_000_000_000, um: 'open' },
          lessons: [{ n: 'Cells', notes: [], cards: [{ k: 0, f: 'Question', b: 'Answer' }] }],
        },
      })),
    });
    const preview = page.getByRole('heading', { name: 'Ready to import' });
    await expect(preview).toBeVisible();
    const add = page.getByRole('button', { name: 'Add to my courses' });
    await add.scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`scheduling-preview-${width}.png`) });
    await expect(add).toBeDisabled();
    await expect(page.getByText(/Teacher suggests/)).toBeVisible();
    await page.getByRole('radio', { name: /Exam date/ }).press('Space');
    await expect(page.getByText('Exam date and time', { exact: true })).toBeVisible();
    await expect(add).toBeEnabled();
    if (width === 1280) {
      await page.getByRole('button', { name: 'Exam date and time' }).click();
      await page.getByRole('button', { name: '19 March 2030', exact: true }).click();
      await page.keyboard.press('Escape');
    } else {
      await page.getByRole('radio', { name: /Steady retention/ }).press('Space');
      await expect(page.getByText('Exam date and time', { exact: true })).toBeHidden();
    }
    await add.scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: testInfo.outputPath(`scheduling-choice-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await add.click();
    await expect(preview).toBeHidden();
    const final = await page.evaluate(() => new Promise<{ schedulingMode?: string; examDate?: number }>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const tx = database.transaction(['courses', 'courseAssessments']);
        const courses = tx.objectStore('courses').getAll();
        const assessments = tx.objectStore('courseAssessments').getAll();
        tx.oncomplete = () => {
          database.close();
          const course = courses.result.find((row) => row.name === 'Biology scheduling');
          resolve(assessments.result.find((row) => row.courseId === course?.id && row.kind === 'final'));
        };
        tx.onabort = () => reject(tx.error);
      };
    }));
    if (width === 1280) {
      expect(final.schedulingMode).toBe('exam');
      expect(new Date(final.examDate!).toISOString().slice(0, 10)).toBe('2030-03-19');
    } else {
      expect(final.schedulingMode).toBe('steady');
      expect(final.examDate).toBeUndefined();
    }
  });
}
