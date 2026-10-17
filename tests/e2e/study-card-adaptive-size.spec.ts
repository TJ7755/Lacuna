import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import type { Card, Lesson } from '../../src/db/types';
import { createCourse } from './fixtures/lacunaApp';

const directory = 'artifacts/study-card-adaptive-size';
const kinds = ['short', 'medium', 'long', 'occlusion', 'short-return'];

async function prepareSession(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await createCourse(page, 'Adaptive cards');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())![1];
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'New card', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Front', exact: true }).fill('Leucocytes');
  await page.getByRole('textbox', { name: 'Back', exact: true }).fill('White blood cells.');
  await page.getByRole('button', { name: 'Add card', exact: true }).click();
  await expect(page).not.toHaveURL(/\/cards\/new$/);

  return page.evaluate(
    async ({ courseId, kinds }) => {
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
      const original = (await read<Card>('cards')).find((card) => card.courseId === courseId)!;
      const lesson = (await read<Lesson>('lessons')).find(
        (lesson) => lesson.courseId === courseId,
      )!;
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 1800;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 600, 1800);
      context.fillStyle = '#b55262';
      context.beginPath();
      context.ellipse(300, 900, 200, 700, 0, 0, 2 * Math.PI);
      context.fill();
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!)));
      const transaction = database.transaction(['cards', 'assets', 'occlusions'], 'readwrite');
      transaction.objectStore('cards').delete(original.id);
      const paragraphs = (count: number) =>
        Array.from(
          { length: count },
          (_, i) => `Paragraph ${i + 1}. Leucocytes protect the body against infection.`,
        ).join('\n\n');
      for (const [index, kind] of kinds.entries()) {
        transaction.objectStore('cards').put({
          ...original,
          id: `adaptive-${index}`,
          createdAt: original.createdAt + index,
          front:
            kind === 'medium' ? paragraphs(5) : kind === 'long' ? paragraphs(80) : original.front,
          back:
            kind === 'medium' ? paragraphs(6) : kind === 'long' ? paragraphs(80) : original.back,
          ...(kind === 'occlusion' ? { occlusionRegionId: 'adaptive-target' } : {}),
        });
      }
      transaction.objectStore('assets').put({
        hash: 'adaptive-image',
        blob,
        mimeType: 'image/png',
        width: 600,
        height: 1800,
        createdAt: Date.now(),
      });
      transaction.objectStore('occlusions').put({
        id: 'adaptive-occlusion',
        courseId,
        primaryLessonId: lesson.id,
        name: 'Tall diagram',
        assetHash: 'adaptive-image',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        regions: [
          {
            id: 'adaptive-target',
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
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
      database.close();
      return lesson.id;
    },
    { courseId, kinds },
  );
}

async function measure(page: Page) {
  return page
    .locator('[data-study-card-id]:not([aria-hidden="true"]) [data-study-face]')
    .evaluate((face) => {
      const surface = face.parentElement!;
      const card = surface.getBoundingClientRect();
      const slot = face.closest('.study-card-slot')!.getBoundingClientRect();
      const controls = document.querySelector('.study-controls')!.getBoundingClientRect();
      return {
        height: surface.offsetHeight,
        available: slot.height,
        centreOffset: card.y + card.height / 2 - slot.y - slot.height / 2,
        controlsTop: controls.y,
        bodyScrolls: face.scrollHeight > face.clientHeight + 1,
        documentHeight: document.documentElement.scrollHeight,
        scrollY: window.scrollY,
      };
    });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 2000, height: 1170 },
  { width: 390, height: 844 },
]) {
  test(`adapts card heights and keeps controls fixed at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem('lacuna.inputMode', 'keyboard');
      localStorage.setItem('lacuna-theme', 'dark');
    });
    const lessonId = await prepareSession(page);
    await page.setViewportSize(viewport);
    await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
    await page.evaluate(() => document.fonts.ready);
    await mkdir(directory, { recursive: true });
    const records = [];
    let controlsTop: number | undefined;
    let shortHeight = 0;

    for (const [index, kind] of kinds.entries()) {
      const card = page.locator(`[data-study-card-id="adaptive-${index}"]`);
      await expect(card.locator('[data-study-face="front"]')).toBeVisible();
      for (const side of kind === 'short-return' ? ['front'] : ['front', 'back']) {
        if (side === 'back')
          await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
        const body = card.locator(`[data-study-face="${side}"]`);
        await expect(body).toBeVisible();
        // Include the real entrance/flip, then capture its settled layout.
        await page.waitForTimeout(650);
        await page.screenshot({
          path: `${directory}/${viewport.width}x${viewport.height}-${kind}-${side}.png`,
        });
        const dimensions = await measure(page);
        records.push({ kind, side, ...dimensions });
        controlsTop ??= dimensions.controlsTop;
        expect.soft(dimensions.documentHeight).toBe(viewport.height);
        expect.soft(dimensions.scrollY).toBe(0);
        expect.soft(Math.abs(dimensions.centreOffset)).toBeLessThan(1);
        expect.soft(Math.abs(dimensions.controlsTop - controlsTop)).toBeLessThan(1);
        expect.soft(dimensions.height).toBeLessThanOrEqual(dimensions.available + 1);
        if (kind.startsWith('short')) {
          expect.soft(dimensions.height).toBeLessThanOrEqual(310);
          expect.soft(dimensions.bodyScrolls).toBe(false);
          shortHeight = dimensions.height;
        } else if (kind === 'medium') {
          expect.soft(dimensions.height).toBeGreaterThan(shortHeight);
        } else if (kind === 'long') {
          expect.soft(dimensions.height).toBeCloseTo(dimensions.available, 0);
          expect.soft(dimensions.bodyScrolls).toBe(true);
        } else if (kind === 'occlusion') {
          await expect.soft(body.getByRole('img')).toBeInViewport({ ratio: 1 });
          expect.soft(dimensions.bodyScrolls).toBe(false);
          const geometry = await body.getByRole('img').evaluate((image) => {
            const picture = image.getBoundingClientRect();
            const layer = image.parentElement!.getBoundingClientRect();
            const mask = image.parentElement!.querySelector('.absolute')!.getBoundingClientRect();
            return {
              ratio: picture.width / picture.height,
              widthDifference: layer.width - picture.width,
              heightDifference: layer.height - picture.height,
              x: (mask.x - picture.x) / picture.width,
              y: (mask.y - picture.y) / picture.height,
            };
          });
          expect.soft(geometry.ratio).toBeCloseTo(1 / 3, 3);
          expect.soft(Math.abs(geometry.widthDifference)).toBeLessThan(1);
          expect.soft(Math.abs(geometry.heightDifference)).toBeLessThan(1);
          expect.soft(geometry.x).toBeCloseTo(0.1, 2);
          expect.soft(geometry.y).toBeCloseTo(0.1, 2);
        }
        const actions =
          side === 'front'
            ? page.getByRole('button', { name: 'Show answer', exact: true }).last()
            : page.getByRole('button', { name: /^(No|Yes)$/ });
        for (const button of await actions.all()) {
          await expect.soft(button).toBeVisible();
          // IntersectionObserver rounds fractional button bounds; check each edge directly.
          const bounds = (await button.boundingBox())!;
          expect.soft(bounds.x).toBeGreaterThanOrEqual(0);
          expect.soft(bounds.y).toBeGreaterThanOrEqual(0);
          expect.soft(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
          expect.soft(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
          expect
            .soft(
              await button.evaluate((button) => {
                const bounds = button.getBoundingClientRect();
                return button.contains(
                  document.elementFromPoint(
                    bounds.x + bounds.width / 2,
                    bounds.y + bounds.height / 2,
                  ),
                );
              }),
            )
            .toBe(true);
        }
      }
      if (kind === 'short-return') break;
      const transition = await page.evaluate(async () => {
        const outgoing = document.querySelector('[data-study-card-id]:not([aria-hidden="true"])')!;
        const surface = outgoing.querySelector('[data-study-face]')!.parentElement!;
        const initialHeight = surface.offsetHeight;
        const top = document.querySelector('.study-controls')!.getBoundingClientRect().top;
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.trim() === 'Yes')!
          .click();
        return new Promise<{
          controlsMovement: number;
          outgoingResize: number;
          overlapped: boolean;
        }>((resolve) => {
          const started = performance.now();
          let controlsMovement = 0;
          let outgoingResize = 0;
          let overlapped = false;
          const sample = () => {
            const controls = document.querySelector('.study-controls');
            if (controls)
              controlsMovement = Math.max(
                controlsMovement,
                Math.abs(controls.getBoundingClientRect().top - top),
              );
            if (outgoing.isConnected)
              outgoingResize = Math.max(
                outgoingResize,
                Math.abs(surface.offsetHeight - initialHeight),
              );
            overlapped ||= document.querySelectorAll('[data-study-card-id]').length > 1;
            if (performance.now() - started > 1000)
              resolve({ controlsMovement, outgoingResize, overlapped });
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
      });
      records.push({ kind, transition });
      expect.soft(transition.controlsMovement).toBeLessThan(1);
      expect.soft(transition.outgoingResize).toBeLessThan(1);
      expect.soft(transition.overlapped).toBe(true);
    }
    await writeFile(
      `${directory}/${viewport.width}x${viewport.height}-measurements.json`,
      JSON.stringify(records, null, 2),
    );
  });
}
