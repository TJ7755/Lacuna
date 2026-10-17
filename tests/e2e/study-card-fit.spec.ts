import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import type { Card, Lesson } from '../../src/db/types';

const viewports = [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
];
const screenshotStage = process.env.STUDY_FIT_SCREENSHOTS;

async function prepareCard(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
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
      } else if (kind === 'reversed') {
        next.type = 'basic_reversed';
      } else if (kind === 'sequence' || kind === 'lines') {
        next.sequenceItemId = 'study-fit-item';
        next.front = '**Sequence**\n\nPrevious item';
        next.back = 'Next item';
        if (kind === 'lines') {
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
        }
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

async function capture(page: Page, name: string) {
  if (!screenshotStage) return;
  await expect(
    page.getByLabel('Notifications', { exact: true }).getByText('Card added.', { exact: true }),
  ).toBeHidden();
  await mkdir('artifacts/study-card-fit', { recursive: true });
  await page.screenshot({ path: `artifacts/study-card-fit/${screenshotStage}-${name}.png` });
}

for (const mode of ['simple', 'practice']) {
  test(`keeps long recitation actions visible in ${mode}`, async ({ page }) => {
    const { card, lessonId } = await prepareCard(page);
    await seedCard(page, card, 'lines');
    await page.setViewportSize(viewports[2]);
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

for (const theme of ['light', 'dark']) {
  for (const { viewport, inputMode } of [
    ...viewports.map((viewport) => ({ viewport, inputMode: 'keyboard' })),
    { viewport: viewports[2], inputMode: 'touch' },
  ]) {
    test(`fits tall occlusion in ${theme} at ${viewport.width}x${viewport.height} with ${inputMode}`, async ({
      page,
    }) => {
      await page.addInitScript((theme) => {
        localStorage.setItem('lacuna-theme', theme);
        localStorage.setItem('lacuna.inputMode', 'keyboard');
        localStorage.setItem('lacuna.gradingMode', 'manual');
      }, theme);
      const { card, lessonId } = await prepareCard(page);
      await seedCard(page, card, 'occlusion');
      await page.evaluate(
        (inputMode) => localStorage.setItem('lacuna.inputMode', inputMode),
        inputMode,
      );
      await page.setViewportSize(viewport);
      await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
      const front = page.locator('[data-study-face="front"]');
      await expect(front.getByRole('img', { name: 'Tall diagram' })).toBeVisible();
      await expect(front.getByRole('img')).toBeInViewport({ ratio: 1 });
      await page.evaluate(() => document.fonts.ready);
      const name = `${theme}-${viewport.width}x${viewport.height}${inputMode === 'touch' ? '-touch' : ''}`;
      await capture(page, `${name}-front`);
      await expectFits(page, page.getByRole('button', { name: 'Show answer', exact: true }).last());
      await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      const back = page.locator('[data-study-face="back"]');
      await expect(back.getByText('Diagram note')).toBeVisible();
      await expect(back.locator('..')).toHaveCSS('transform', 'none');
      await expect(back.getByRole('img')).toBeInViewport({ ratio: 1 });
      expect(await back.evaluate((body) => body.scrollHeight <= body.clientHeight + 1)).toBe(true);
      await capture(page, `${name}-revealed`);
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
  }
}

for (const inputMode of ['keyboard', 'touch']) {
  for (const viewport of [viewports[0], viewports[2]]) {
    test(`keeps grades hittable beneath feedback in ${inputMode} at ${viewport.width}px`, async ({
      page,
    }) => {
      const { card, lessonId } = await prepareCard(page);
      await seedCard(page, card, 'basic', 3);
      await page.evaluate((inputMode) => {
        localStorage.setItem('lacuna.inputMode', inputMode);
      }, inputMode);
      await page.setViewportSize(viewport);
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
      const notification = await notifications.boundingBox();
      for (const grade of await grades.all()) {
        const bounds = (await grade.boundingBox())!;
        expect(notification!.y + notification!.height).toBeLessThanOrEqual(bounds.y);
      }
      await capture(page, `feedback-${inputMode}-${viewport.width}x${viewport.height}`);
      // Undo remains usable even though the notification surface passes taps through.
      await notifications.getByRole('button', { name: 'Undo' }).click();
      await expect(activeCard).toHaveAttribute('data-study-card-id', firstId!);
    });
  }
}

for (const kind of ['basic', 'reversed', 'cloze', 'sequence', 'typed', 'image', 'long-text']) {
  for (const mode of ['simple', 'practice']) {
    test(`${kind} fits before and after reveal in ${mode}`, async ({ page }) => {
      const { card, lessonId } = await prepareCard(page);
      await seedCard(page, card, kind);
      for (const viewport of [viewports[0], viewports[2]]) {
        await page.setViewportSize(viewport);
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
      }
    });
  }
}
