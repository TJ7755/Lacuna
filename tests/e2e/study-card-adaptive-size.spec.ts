import { expect, test, type Page } from '@playwright/test';
import { seedStudyCards } from './fixtures/studyCards';

const viewport = { width: 1440, height: 900 };
const kinds = ['short', 'medium', 'long', 'occlusion', 'short-return'];

async function prepareSession(page: Page) {
  await page.setViewportSize(viewport);
  const {
    courseId,
    lessonId,
    cards: [original],
  } = await seedStudyCards(page, 'Adaptive cards', [['Leucocytes', 'White blood cells.']]);

  await page.evaluate(
    async ({ courseId, lessonId, original, kinds }) => {
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
        primaryLessonId: lessonId,
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
    },
    { courseId, lessonId, original, kinds },
  );
  return lessonId;
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

test('adapts card heights and keeps controls fixed on desktop', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    localStorage.setItem('lacuna.inputMode', 'keyboard');
    localStorage.setItem('lacuna-theme', 'dark');
  });
  const lessonId = await prepareSession(page);
  await page.goto(`/#/lesson/${lessonId}/learn?mode=simple`);
  await page.evaluate(() => document.fonts.ready);
  let controlsTop: number | undefined;
  const visited = new Set<string>();
  const shortHeights: number[] = [];
  const mediumHeights: number[] = [];

  for (let position = 0; position < kinds.length; position += 1) {
    const active = page.locator('[data-study-card-id]:not([aria-hidden="true"])');
    await expect(active.locator('[data-study-face="front"]')).toBeVisible();
    const cardId = (await active.getAttribute('data-study-card-id'))!;
    expect(cardId).toMatch(/^adaptive-[0-4]$/);
    expect(visited.has(cardId)).toBe(false);
    visited.add(cardId);
    const kind = kinds[Number(cardId.slice('adaptive-'.length))];
    const card = page.locator(`[data-study-card-id="${cardId}"]`);
    for (const side of ['front', 'back']) {
      if (side === 'back')
        await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
      const body = card.locator(`[data-study-face="${side}"]`);
      await expect(body).toBeVisible();
      // Include the real entrance and flip before measuring the settled layout.
      await page.waitForTimeout(650);
      const dimensions = await measure(page);
      controlsTop ??= dimensions.controlsTop;
      expect.soft(dimensions.documentHeight).toBe(viewport.height);
      expect.soft(dimensions.scrollY).toBe(0);
      expect.soft(Math.abs(dimensions.centreOffset)).toBeLessThan(1);
      expect.soft(Math.abs(dimensions.controlsTop - controlsTop)).toBeLessThan(1);
      expect.soft(dimensions.height).toBeLessThanOrEqual(dimensions.available + 1);
      if (kind.startsWith('short')) {
        expect.soft(dimensions.height).toBeLessThanOrEqual(310);
        expect.soft(dimensions.bodyScrolls).toBe(false);
        shortHeights.push(dimensions.height);
      } else if (kind === 'medium') {
        mediumHeights.push(dimensions.height);
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
    if (position === kinds.length - 1) break;
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
    expect.soft(transition.controlsMovement).toBeLessThan(1);
    expect.soft(transition.outgoingResize).toBeLessThan(1);
    expect.soft(transition.overlapped).toBe(true);
  }
  expect([...visited].sort()).toEqual(kinds.map((_, index) => `adaptive-${index}`));
  expect(shortHeights).toHaveLength(4);
  expect(mediumHeights).toHaveLength(2);
  // Compare after visiting every card: a shuffled medium card may precede both short cards.
  for (const height of mediumHeights)
    expect.soft(height).toBeGreaterThan(Math.max(...shortHeights));
});
