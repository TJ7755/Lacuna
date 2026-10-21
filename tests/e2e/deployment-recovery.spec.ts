import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test('recovers a missing deployment chunk after cache cleanup without a manual refresh', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => {
    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem(
        'deployment-test-reloads',
        String(Number(sessionStorage.getItem('deployment-test-reloads') ?? 0) + 1),
      );
      if (sessionStorage.getItem('deployment-test-cleanup') === 'pending') {
        sessionStorage.setItem('deployment-test-premature-reload', 'true');
      }
    });
  });
  await enterFreshLacuna(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  // Delay real cache deletion to expose the race with the route's old bare reload.
  await page.evaluate(async () => {
    const cache = await caches.open('deployment-test-old-shell');
    await cache.put('/deployment-test-old-shell', new Response('Old deployment'));
    const original = caches.delete.bind(caches);
    caches.delete = async (name) => {
      sessionStorage.setItem('deployment-test-cleanup', 'pending');
      await new Promise((resolve) => setTimeout(resolve, 300));
      const result = await original(name);
      if (name === 'deployment-test-old-shell') {
        sessionStorage.setItem('deployment-test-cleanup', 'complete');
      }
      return result;
    };
    sessionStorage.removeItem('deployment-test-reloads');
  });

  let missingChunks = 0;
  await context.route(/\/assets\/HelpPage-[^/]+\.js$/, async (route) => {
    missingChunks += 1;
    if (missingChunks === 1) {
      await route.fulfill({ status: 404, contentType: 'text/plain', body: 'Old chunk removed' });
    } else {
      await route.continue();
    }
  });

  await page.evaluate(() => {
    window.location.hash = '#/help';
  });
  await expect(page.getByRole('heading', { name: 'Help', exact: true })).toBeVisible();
  expect(missingChunks).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(() => ({
      reloads: sessionStorage.getItem('deployment-test-reloads'),
      premature: sessionStorage.getItem('deployment-test-premature-reload'),
    })),
  ).toEqual({ reloads: '1', premature: null });
  await expect(page.getByText('Something went wrong', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => caches.has('deployment-test-old-shell'))).toBe(false);
});
