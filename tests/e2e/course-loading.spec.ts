import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { currentSharePayload } from './fixtures/currentSharePayload';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 375]) {
  test(`shows course download and retry feedback without blocking Back at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const file = JSON.stringify({
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: currentSharePayload({
        v: 6,
        at: 1000,
        li: 'loading-biology',
        course: { n: 'Loading biology', o: 0, c: 0, e: 0, um: 'open' },
        lessons: [{ n: 'Cells', notes: [], cards: [{ k: 0, f: 'Question', b: 'Answer' }] }],
      }),
    });
    let finish: (status: number) => void = () => {};
    let requests = 0;
    await page.route('https://relay.getlacuna.app/shares/*/*', async (route) => {
      const slot = new URL(route.request().url()).pathname.split('/').at(-1);
      if (slot === 'meta') {
        await route.fulfill({
          headers: { ETag: '"1"', 'Access-Control-Expose-Headers': 'ETag' },
          json: {
            v: 1,
            lineageId: 'loading-biology',
            revision: 1,
            publishedAt: 1000,
            byteSize: Buffer.byteLength(file),
            courseName: 'Loading biology',
          },
        });
        return;
      }
      const status = await new Promise<number>((resolve) => {
        finish = resolve;
        requests += 1;
      });
      await route.fulfill({
        status,
        headers: { ETag: '"1"', 'Access-Control-Expose-Headers': 'ETag' },
        body: status === 200 ? file : '',
      });
    });

    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await page.getByRole('button', { name: 'Course library', exact: true }).click();
    const search = page.getByRole('searchbox', { name: 'Search the course library' });
    await search.fill('8461');
    const choose = page.getByRole('button', { name: 'Biology AQA GCSE · 8461', exact: true });
    await choose.click();
    await expect.poll(() => requests).toBe(1);
    const loading = page.getByRole('status').filter({ hasText: 'Loading this course' });
    const back = page.getByRole('button', { name: 'Back to the course library' });
    await page.screenshot({ path: testInfo.outputPath(`course-loading-${width}.png`) });
    await expect(loading).toBeVisible();
    await expect(back).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeHidden();

    finish(503);
    await expect(page.getByRole('heading', { name: 'This course is unavailable' })).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => requests).toBe(2);
    await expect(loading).toBeVisible();
    await expect(page.getByRole('heading', { name: 'This course is unavailable' })).toBeHidden();
    await expect(back).toBeEnabled();
    finish(200);
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
    await expect(loading).toBeHidden();
    await back.click();
    await expect(search).toHaveValue('8461');

    await choose.click();
    await expect.poll(() => requests).toBe(3);
    await expect(loading).toBeVisible();
    const cancelled = page.waitForEvent('requestfailed', (request) =>
      new URL(request.url()).pathname.endsWith('/payload'),
    );
    await back.click();
    await expect(search).toBeFocused();
    await cancelled;
    finish(200);
    await expect(loading).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);

    await page.goto(`/#/s/${'a'.repeat(32)}`);
    await expect.poll(() => requests).toBe(4);
    await expect(page.getByRole('status').filter({ hasText: 'Loading this link' })).toBeVisible();
    finish(404);
    await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
  });
}
