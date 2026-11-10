import { expect, test } from '@playwright/test';
import { build } from 'esbuild';

let fixtureSource: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['scripts/performance-heavy/fixture.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'LacunaHeavyFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  fixtureSource = bundle.outputFiles[0].text;
});

test('bounds off-screen lesson rows and reveals later cards when scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  // Reuse the owned, small performance fixture without mounting the app during seeding.
  await page.route('**/__virtual_fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Virtual list regression</title>',
    }),
  );
  await page.goto('/__virtual_fixture');
  await page.addScriptTag({ content: fixtureSource });
  await page.evaluate(async () => {
    await (
      window as unknown as {
        LacunaHeavyFixture: { seed(small: boolean): Promise<unknown> };
      }
    ).LacunaHeavyFixture.seed(true);
  });
  await page.goto('/#/course/heavy-course-0/cards');
  const rows = page.locator('[data-card-id]');
  await expect(rows.first()).toBeVisible();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(22);

  const main = page.locator('main:has([data-route-content$="/cards"])');
  const lastCard = page.getByText(
    'Recall item 0-1-99: explain the relationship between energy and motion.',
    { exact: true },
  );
  const firstCardId = await rows.first().getAttribute('data-card-id');
  const focusedDetails = page.locator(`[data-card-id="${firstCardId}"] [data-card-details]`);
  await focusedDetails.focus();
  // Newly measured rows can change the estimated end of the list after a large jump.
  await expect(async () => {
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(lastCard).toBeInViewport({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect(focusedDetails).toBeFocused();
  await focusedDetails.blur();
  await expect(focusedDetails).toHaveCount(0);
  await expect.poll(() => rows.count()).toBeLessThanOrEqual(22);

  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(
    page.getByText('Recall item 0-0-0: explain the relationship between energy and motion.', {
      exact: true,
    }),
  ).toBeInViewport();
  // An unfinished bulk action keeps its fixed toolbar and draft while another
  // lesson is in view; completing it releases the section for windowing again.
  await page.getByRole('button', { name: 'Select', exact: true }).first().click();
  await rows.first().click();
  await page.getByRole('button', { name: 'Tag…', exact: true }).click();
  const draft = page.getByLabel('Tag for 1 card');
  await draft.fill('unfinished tag');
  await expect(async () => {
    await main.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect(lastCard).toBeInViewport({ timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect(draft).toHaveValue('unfinished tag');
  await expect(draft).toBeFocused();
  await expect(draft).toBeInViewport();
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(rows.first().getByRole('button', { name: /^Select card:/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await page.getByLabel('Search all cards').fill('Recall item 0-1-99');
  await expect(rows).toHaveCount(1);
  await rows.first().click();
  await expect(rows.first().getByRole('button', { name: /^Card details:/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

for (const manyLessons of [false, true]) {
  test(`windows small image groups in ${manyLessons ? 'many lessons' : 'one lesson'} and searches unmounted cards`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1365, height: 900 });
    await page.route('**/__virtual_fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Image group regression</title>',
      }),
    );
    await page.goto('/__virtual_fixture');
    await page.addScriptTag({ content: fixtureSource });
    await page.evaluate(async (manyLessons) => {
      await (
        window as unknown as {
          LacunaHeavyFixture: { seed(small: boolean): Promise<unknown> };
        }
      ).LacunaHeavyFixture.seed(true);
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const read = <T>(store: string) =>
        new Promise<T[]>((resolve, reject) => {
          const request = database.transaction(store).objectStore(store).getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [cards, lessons, units] = await Promise.all([
        read<Record<string, unknown>>('cards'),
        read<Record<string, unknown>>('lessons'),
        read<Record<string, unknown>>('schedulingUnits'),
      ]);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 128;
      canvas.getContext('2d')!.fillRect(0, 0, 128, 128);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((value) => resolve(value!)));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ['cards', 'lessons', 'schedulingUnits', 'occlusions', 'assets'],
          'readwrite',
        );
        transaction.objectStore('cards').clear();
        transaction.objectStore('lessons').clear();
        const hash = 'a'.repeat(64);
        transaction.objectStore('assets').put({
          hash,
          blob: bytes,
          mimeType: 'image/png',
          kind: 'image',
          width: 128,
          height: 128,
          createdAt: Date.now(),
        });
        for (let index = 0; index < 20; index++) {
          const lessonId = `image-lesson-${index}`;
          const ownerLessonId = manyLessons ? lessonId : 'image-lesson-0';
          transaction.objectStore('lessons').put({
            ...lessons[0],
            id: lessonId,
            name: `Image lesson ${index}`,
            orderIndex: index,
          });
          transaction.objectStore('schedulingUnits').put({
            ...units.find((unit) => unit.lessonId),
            id: lessonId,
            lessonId,
          });
          for (let group = 0; group < 2; group++) {
            const ownerId = `diagram-${index * 2 + group}`;
            transaction.objectStore('occlusions').put({
              id: ownerId,
              name: ownerId,
              courseId: 'heavy-course-0',
              primaryLessonId: ownerLessonId,
              assetHash: hash,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              regions: Array.from({ length: 4 }, (_, region) => ({
                id: `${ownerId}-${region}`,
                role: 'label',
                shape: 'rectangle',
                x: 0.1 + region * 0.2,
                y: 0.3,
                w: 0.1,
                h: 0.1,
                answerText: `Region answer ${index * 8 + group * 4 + region}`,
              })),
            });
            for (let region = 0; region < 4; region++) {
              const number = index * 8 + group * 4 + region;
              transaction.objectStore('cards').put({
                ...cards[0],
                id: `image-card-${number}`,
                front: `Image prompt ${number}`,
                back: `Image prompt ${number}`,
                primaryLessonId: ownerLessonId,
                schedulingUnitId: ownerLessonId,
                deckId: ownerLessonId,
                occlusionRegionId: `${ownerId}-${region}`,
                history: [],
              });
            }
          }
        }
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    }, manyLessons);
    await page.goto('/#/course/heavy-course-0/cards');
    const rows = page.locator('[data-card-id]');
    await expect(rows.first()).toBeVisible();
    await expect.poll(() => rows.count()).toBeLessThan(40);
    await expect.poll(() => page.locator('[data-occlusion-thumbnail]').count()).toBeLessThan(40);
    await testInfo.attach('Cards with image groups', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    const main = page.locator('main:has([data-route-content$="/cards"])');
    const expanded = page
      .locator('[data-card-id="image-card-0"]')
      .getByRole('button', { name: /^Card details:/ });
    // Equal creation times retain IndexedDB's lexical card-ID order within a
    // lesson: the final group in the single-lesson fixture contains cards 96–99.
    const lastCardId = manyLessons ? 'image-card-159' : 'image-card-99';
    await page.locator('[data-card-id="image-card-0"]').click();
    await expect(expanded).toHaveAttribute('aria-expanded', 'true');
    await expect(async () => {
      await main.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.locator(`[data-card-id="${lastCardId}"]`)).toBeInViewport({
        timeout: 500,
      });
    }).toPass({ timeout: 10000 });
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect(expanded).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-card-id="image-card-0"]').click();
    // Once closed, the idle group may be evicted. Returning must not replay its
    // row fade or its lesson's arrival animation.
    await expect(async () => {
      await main.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(page.locator(`[data-card-id="${lastCardId}"]`)).toBeInViewport({
        timeout: 500,
      });
    }).toPass({ timeout: 10000 });
    await main.evaluate((element) => {
      element.scrollTop = 0;
    });
    const firstRow = page.locator('[data-card-id="image-card-0"]');
    await expect(firstRow).toBeInViewport();
    expect(
      await firstRow.evaluate((element) => {
        for (
          let node: Element | null = element;
          node && node.tagName !== 'MAIN';
          node = node.parentElement
        ) {
          if (getComputedStyle(node).opacity !== '1') return false;
        }
        return true;
      }),
    ).toBe(true);
    const search = page.getByLabel('Search all cards');
    await search.fill('Image prompt 159');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-card-id', 'image-card-159');
    await expect(search).toBeFocused();
    await search.fill('Region answer 159');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-card-id', 'image-card-159');
    await expect(rows.first().locator('[data-card-answer]')).toHaveText('Region answer 159');
    await search.fill('');
    await expect(page.locator('[data-card-id="image-card-0"]')).toBeVisible();
    await expect.poll(() => rows.count()).toBeLessThan(40);
    await expect(search).toBeFocused();
  });
}
