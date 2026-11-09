import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import { currentSharePayload } from './fixtures/currentSharePayload';
import { settle } from './fixtures/flowEvidence';

test.use({ serviceWorkers: 'block' });

for (const width of [1280, 375]) {
  test(`shows course download and retry feedback without blocking Back at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    const lessonNames = [
      'Life processes',
      'Animal cell structures',
      'Plant cell structures',
      'Enzymes as biological catalysts',
      'Temperature and enzyme activity',
      'Respiration and ATP',
      'Diffusion across cell membranes',
      'Active transport across membranes',
    ];
    const file = JSON.stringify({
      format: 'lacuna-course',
      version: 1,
      assets: [],
      payload: currentSharePayload({
        v: 6,
        at: 1000,
        li: 'loading-biology',
        course: { n: 'Loading biology', o: 0, c: 0, e: 0, um: 'open' },
        lessons: lessonNames.map((name) => ({
          n: name,
          notes: [],
          cards: [{ k: 0, f: 'Question', b: 'Answer' }],
        })),
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
    const choose = page.getByRole('button', { name: 'Biology AQA GCSE (8461)', exact: true });
    await choose.click();
    await expect.poll(() => requests).toBe(1);
    const loading = page.getByRole('status').filter({ hasText: 'Loading this course' });
    const back = page.getByRole('button', { name: 'Back to the course library' });
    if (width === 1280) {
      await page.screenshot({ path: testInfo.outputPath('course-loading.png') });
    }
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
    const preview = page.getByRole('heading', { name: 'Loading biology', exact: true });
    await expect(preview).toBeVisible();
    await expect(loading).toBeHidden();

    if (width === 1280) {
      const surface = page.locator('.flow-expansion').filter({ has: preview });
      const disclosure = surface.getByRole('button', { name: '8 lessons', exact: true });
      const lessons = surface.getByRole('list', { name: 'Lessons', exact: true });
      await expect(disclosure).toBeVisible();
      await expect(lessons).toBeHidden();
      await settle(surface);
      await testInfo.attach('Course preview with lessons closed', {
        body: await surface.screenshot(),
        contentType: 'image/png',
      });

      // Capture the opening from its first frame, before Playwright waits for it to settle.
      const sampleOpening = () =>
        disclosure.evaluate(
          (button: HTMLButtonElement) =>
            new Promise<number[]>((resolve) => {
              const box = button.parentElement!;
              const heights = [box.offsetHeight];
              const start = performance.now();
              button.click();
              const sample = () => {
                heights.push(box.offsetHeight);
                if (performance.now() - start < 600) requestAnimationFrame(sample);
                else resolve(heights);
              };
              requestAnimationFrame(sample);
            }),
        );
      const heights = await sampleOpening();
      const closedHeight = heights[0];
      const openHeight = heights.at(-1)!;
      expect(openHeight).toBeGreaterThan(closedHeight);
      expect(heights.some((height) => height > closedHeight && height < openHeight)).toBe(true);
      await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
      await expect(lessons).toBeVisible();
      await expect(lessons.getByText('Life processes', { exact: true })).toBeInViewport();
      await settle(surface);
      await testInfo.attach('Course preview with lessons open', {
        body: await surface.screenshot(),
        contentType: 'image/png',
      });

      await lessons.press('End');
      await expect(
        lessons.getByText('Active transport across membranes', { exact: true }),
      ).toBeInViewport();
      await disclosure.press('Space');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(lessons).toBeHidden();
      await settle(surface);

      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reducedHeights = await sampleOpening();
      expect(reducedHeights.at(-1)).toBe(openHeight);
      expect(
        reducedHeights.every((height) => height === closedHeight || height === openHeight),
      ).toBe(true);
      await expect(lessons).toBeVisible();
      await disclosure.press('Enter');
      await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
      await expect(lessons).toBeHidden();
    }

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
    await expect(preview).toBeHidden();
    await expect(page).toHaveURL(/#\/$/);

    await page.goto(`/#/s/${'a'.repeat(32)}`);
    await expect.poll(() => requests).toBe(4);
    await expect(page.getByRole('status').filter({ hasText: 'Loading this link' })).toBeVisible();
    finish(404);
    await expect(page.getByRole('heading', { name: 'This link is unavailable' })).toBeVisible();
  });
}
