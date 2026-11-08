import { expect, test, type Locator, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import type { Card, Lesson } from '@lacuna/core/db/types';

const viewport = { width: 1280, height: 800 };

async function prepareCard(page: Page) {
  await page.setViewportSize(viewport);
  await enterFreshLacuna(page);
  await createCourse(page, 'Card fit');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Front' }).fill('Question');
  await page.getByRole('textbox', { name: 'Back' }).fill('Answer');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);
  return page.evaluate(async (courseId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = <T>(store: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = database.transaction(store).objectStore(store).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const card = (await read<Card>('cards')).find((card) => card.courseId === courseId)!;
    const lesson = (await read<Lesson>('lessons')).find((lesson) => lesson.courseId === courseId)!;
    database.close();
    return { card, lessonId: lesson.id };
  }, courseId);
}

async function seedCard(page: Page, card: Card, kind: string, copies = 1) {
  await page.evaluate(
    async ({ card, kind, copies }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 1800;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 600, 1800);
      context.fillStyle = '#bb5260';
      context.beginPath();
      context.ellipse(300, 900, 210, 650, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#516ca8';
      context.fillRect(180, 180, 60, 1400);
      context.fillStyle = '#222';
      context.font = '28px sans-serif';
      context.fillText('Tall diagram', 30, 60);
      context.fillText('Target label', 60, 240);
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
      const transaction = database.transaction(
        ['cards', 'occlusions', 'assets', 'courses', 'sequences'],
        'readwrite',
      );
      const course = transaction.objectStore('courses').get(card.courseId!);
      course.onsuccess = () =>
        transaction.objectStore('courses').put({ ...course.result, learnFirst: false });
      transaction.objectStore('assets').put({
        hash: 'study-fit-image',
        blob,
        mimeType: 'image/png',
        width: 600,
        height: 1800,
        createdAt: Date.now(),
      });
      const next = { ...card };
      if (kind === 'occlusion') {
        next.occlusionRegionId = 'study-fit-target';
        transaction.objectStore('occlusions').put({
          id: 'study-fit-occlusion',
          courseId: card.courseId,
          primaryLessonId: card.primaryLessonId,
          name: 'Tall diagram',
          assetHash: 'study-fit-image',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          regions: [
            {
              id: 'study-fit-target',
              role: 'label',
              shape: 'rectangle',
              x: 0.1,
              y: 0.1,
              w: 0.4,
              h: 0.05,
              answerText: 'Target label',
              backNote: 'Diagram note',
            },
          ],
        });
      } else if (kind === 'image') {
        next.front = next.back = '![Tall diagram](lacuna-asset://study-fit-image)';
      } else if (kind === 'cloze') {
        next.type = 'cloze';
        next.front = 'The {{c1::heart}} pumps blood.';
      } else if (kind === 'lines') {
        next.sequenceItemId = 'study-fit-item';
        next.front = '**Sequence**\n\nPrevious item';
        next.back = 'Next item';
        transaction.objectStore('sequences').put({
          id: 'study-fit-sequence',
          courseId: card.courseId,
          primaryLessonId: card.primaryLessonId,
          mode: 'lines',
          name: 'Long recitation',
          cueWindow: 2,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          items: [{ id: 'study-fit-item', value: 'A long line of recitation. '.repeat(100) }],
        });
      } else if (kind === 'typed') {
        next.answerMode = 'type';
      } else if (kind === 'long-text') {
        next.front = next.back = Array.from(
          { length: 80 },
          (_, i) => `Paragraph ${i + 1}. Long text stays inside the card.`,
        ).join('\n\n');
      }
      transaction.objectStore('cards').put(next);
      for (let i = 1; i < copies; i++) {
        transaction
          .objectStore('cards')
          .put({ ...next, id: `${card.id}-${i}`, createdAt: card.createdAt + i });
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
    },
    { card, kind, copies },
  );
}

async function expectFits(page: Page, buttons: Locator) {
  await expect(buttons.first()).toBeVisible();
  expect(
    await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      scrollY: window.scrollY,
    })),
  ).toEqual({ height: page.viewportSize()!.height, width: page.viewportSize()!.width, scrollY: 0 });
  for (const button of await buttons.all()) {
    await expect(button).toBeInViewport({ ratio: 1 });
    expect(
      await button.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        return button.contains(
          document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
        );
      }),
    ).toBe(true);
  }
}

for (const mode of ['simple', 'practice']) {
  test(`keeps long recitation actions visible in ${mode}`, async ({ page }) => {
    const { card, lessonId } = await prepareCard(page);
    await seedCard(page, card, 'lines');
    await page.goto(`/#/lesson/${lessonId}/learn?mode=${mode}`);
    if (mode === 'simple') {
      const recite = page.getByRole('button', { name: 'Recite', exact: true });
      await expectFits(page, recite);
      await recite.click();
    }
    const check = page.getByRole('button', { name: 'Check', exact: true });
    await expectFits(page, check);
    await check.click();
    await expectFits(
      page,
      page.getByRole('button', {
        name: mode === 'simple' ? 'All correct' : 'Continue',
        exact: true,
      }),
    );
  });
}

test('fits a tall occlusion and keeps its mask aligned on desktop', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('lacuna-theme', 'dark');
    localStorage.setItem('lacuna.inputMode', 'keyboard');
    localStorage.setItem('lacuna.gradingMode', 'manual');
  });
  const { card, lessonId } = await prepareCard(page);
  await seedCard(page, card, 'occlusion');
  await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
  const front = page.locator('[data-study-face="front"]');
  await expect(front.getByRole('img', { name: 'Tall diagram' })).toBeVisible();
  await expect(front.getByRole('img')).toBeInViewport({ ratio: 1 });
  await page.evaluate(() => document.fonts.ready);
  await expectFits(page, page.getByRole('button', { name: 'Show answer', exact: true }).last());
  await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  const back = page.locator('[data-study-face="back"]');
  await expect(back.getByText('Diagram note')).toBeVisible();
  await expect(back.locator('..')).toHaveCSS('transform', 'none');
  await expect(back.getByRole('img')).toBeInViewport({ ratio: 1 });
  expect(await back.evaluate((body) => body.scrollHeight <= body.clientHeight + 1)).toBe(true);
  await expectFits(page, page.getByRole('button', { name: /^(Again|Hard|Good|Easy)$/ }));
  const geometry = await back.getByRole('img').evaluate((image) => {
    const rect = image.getBoundingClientRect();
    const layer = image.parentElement!.getBoundingClientRect();
    const mask = image.parentElement!.querySelector('div.absolute')!.getBoundingClientRect();
    return {
      ratio: rect.width / rect.height,
      layerWidth: layer.width - rect.width,
      layerHeight: layer.height - rect.height,
      x: (mask.x - rect.x) / rect.width,
      y: (mask.y - rect.y) / rect.height,
      w: mask.width / rect.width,
      h: mask.height / rect.height,
    };
  });
  expect(geometry.ratio).toBeCloseTo(1 / 3, 3);
  expect(Math.abs(geometry.layerWidth)).toBeLessThan(1);
  expect(Math.abs(geometry.layerHeight)).toBeLessThan(1);
  for (const [key, value] of Object.entries({ x: 0.1, y: 0.1, w: 0.4, h: 0.05 })) {
    expect(geometry[key as keyof typeof geometry]).toBeCloseTo(value, 2);
  }
});

for (const inputMode of ['keyboard', 'touch']) {
  test(`keeps grades hittable beneath feedback in ${inputMode} mode on desktop`, async ({
    page,
  }) => {
    const { card, lessonId } = await prepareCard(page);
    await seedCard(page, card, 'basic', 3);
    await page.evaluate((inputMode) => {
      localStorage.setItem('lacuna.inputMode', inputMode);
    }, inputMode);
    await page.goto(`/#/lesson/${lessonId}/learn`);
    const activeCard = page.locator('[data-study-card-id]').last();
    await expect(activeCard).toBeVisible();
    const firstId = await activeCard.getAttribute('data-study-card-id');
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await expect(page.locator('[data-study-face="back"]')).toBeVisible();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    const notifications = page.getByLabel('Notifications', { exact: true });
    await expect(notifications.getByRole('button', { name: 'Undo' })).toBeVisible();
    await expect(activeCard).not.toHaveAttribute('data-study-card-id', firstId!);
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await expect(page.locator('[data-study-face="back"]')).toBeVisible();
    const grades = page.getByRole('button', { name: /^(Yes|No)$/ });
    await expectFits(page, grades);
    await expect(notifications.getByRole('button', { name: 'Undo' })).toBeVisible();
    const notification = await notifications
      .getByRole('button', { name: 'Undo' })
      .locator('..')
      .boundingBox();
    expect(notification!.height).toBeLessThanOrEqual(56);
    for (const grade of await grades.all()) {
      const bounds = (await grade.boundingBox())!;
      if (inputMode === 'keyboard') {
        expect(notification!.x).toBeGreaterThanOrEqual(bounds.x + bounds.width);
        expect(viewport.height - notification!.y - notification!.height).toBeLessThanOrEqual(24);
      } else {
        expect(notification!.y + notification!.height).toBeLessThanOrEqual(bounds.y);
      }
    }
    expect(
      (await notifications.getByRole('button', { name: 'Undo' }).boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    // Undo remains usable even though the notification surface passes taps through.
    await notifications.getByRole('button', { name: 'Undo' }).click();
    await expect(activeCard).toHaveAttribute('data-study-card-id', firstId!);
  });
}

test('typed feedback stays compact and clear of the next answer on desktop', async ({ page }) => {
  const { card, lessonId } = await prepareCard(page);
  await seedCard(page, card, 'typed', 3);
  await page.evaluate(() => localStorage.setItem('lacuna.inputMode', 'keyboard'));
  await page.goto(`/#/lesson/${lessonId}/learn`);
  const activeCard = page.locator('[data-study-card-id]').last();
  await expect(activeCard).toBeVisible();
  const firstId = await activeCard.getAttribute('data-study-card-id');
  const input = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await input.fill('Answer');
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(activeCard).not.toHaveAttribute('data-study-card-id', firstId!);
  await expect(input).toBeFocused();
  const undo = page
    .getByLabel('Notifications', { exact: true })
    .getByRole('button', { name: 'Undo' });
  await expect(undo).toBeVisible();
  const notification = (await undo.locator('..').boundingBox())!;
  expect(notification.height).toBeLessThanOrEqual(56);
  const inputBox = (await input.boundingBox())!;
  expect(notification.x).toBeGreaterThanOrEqual(inputBox.x + inputBox.width);
  expect(viewport.height - notification.y - notification.height).toBeLessThanOrEqual(24);
  await undo.click();
  await expect(activeCard).toHaveAttribute('data-study-card-id', firstId!);
});

for (const kind of ['cloze', 'typed', 'image', 'long-text']) {
  for (const mode of ['simple', 'practice']) {
    test(`${kind} fits before and after reveal in ${mode}`, async ({ page }) => {
      const { card, lessonId } = await prepareCard(page);
      await seedCard(page, card, kind);
      await page.goto(`/#/lesson/${lessonId}/learn?mode=${mode}`);
      await expect(page.locator('[data-study-face="front"]')).toBeVisible();
      const reveal = page
        .getByRole('button', {
          name: kind === 'typed' ? 'Check answer' : 'Show answer',
          exact: true,
        })
        .last();
      await expectFits(page, reveal);
      if (kind === 'image') {
        await expect(page.locator('[data-study-face="front"] img')).toBeInViewport({ ratio: 1 });
      }
      await reveal.click();
      await expect(page.locator('[data-study-face="back"]')).toBeVisible();
      await expectFits(page, page.getByRole('button', { name: /^(Yes|No)$/ }));
      if (kind === 'image') {
        await expect(page.locator('[data-study-face="back"] img')).toBeInViewport({ ratio: 1 });
      }
      if (kind === 'long-text') {
        const body = page.locator('[data-study-face="back"]');
        expect(await body.evaluate((body) => body.scrollHeight > body.clientHeight)).toBe(true);
        await body.evaluate((body) => {
          body.scrollTop = body.scrollHeight;
        });
        await expect(
          body.getByText('Paragraph 80. Long text stays inside the card.'),
        ).toBeInViewport();
      }
      await page
        .locator('[data-study-card-id]')
        .getByRole('button', { name: 'Hide answer', exact: true })
        .click();
      await expect(page.locator('[data-study-face="front"]')).toBeVisible();
    });
  }
}
