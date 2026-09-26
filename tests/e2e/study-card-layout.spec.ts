import { expect, test, type Locator, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function cardHeight(card: Locator): Promise<number> {
  return card.locator('[data-study-face]').evaluate((face) => face.parentElement!.offsetHeight);
}

async function measuredFaceHeight(card: Locator): Promise<number> {
  return card
    .locator('[data-study-sizing-face]')
    .evaluateAll((faces) => Math.max(...faces.map((face) => (face as HTMLElement).offsetHeight)));
}

async function centreOffsetFromCard(element: Locator): Promise<number> {
  return element.evaluate((element) => {
    const surface = element.closest('[data-study-face]')?.parentElement;
    if (!surface) throw new Error('The study-card surface is missing.');
    let top = 0;
    let node: HTMLElement | null = element as HTMLElement;
    while (node && node !== surface) {
      top += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return top + (element as HTMLElement).offsetHeight / 2 - surface.clientHeight / 2;
  });
}

async function lessonIdForCourse(page: Page, courseId: string) {
  return page.evaluate(
    (expectedCourseId) =>
      new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const lessons = database.transaction('lessons').objectStore('lessons').getAll();
          lessons.onerror = () => reject(lessons.error);
          lessons.onsuccess = () => {
            database.close();
            const lesson = (lessons.result as Array<{ id: string; courseId: string }>).find(
              (candidate) => candidate.courseId === expectedCourseId,
            );
            if (!lesson) reject(new Error('The new course has no lesson.'));
            else resolve(lesson.id);
          };
        };
      }),
    courseId,
  );
}

test('keeps both study-card faces at the larger height across viewport changes', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Stable card');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  const lessonId = await lessonIdForCourse(page, courseId!);
  await page.goto(`/#/course/${courseId}/lesson/${lessonId}/cards/new`);
  await page.getByRole('textbox', { name: 'Front' }).fill('Short question');
  await page
    .getByRole('textbox', { name: 'Back' })
    .fill(
      Array.from({ length: 14 }, (_, index) => `Long answer paragraph ${index + 1}.`).join('\n\n'),
    );
  await page.getByRole('button', { name: 'Add card' }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/lesson/${lessonId}$`));
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Study Stable card' }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();

  const card = page.locator('[data-study-card-id]').first();
  await expect(card.locator('[data-study-face="front"]')).toBeVisible();

  for (const width of [1280, 640]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(async () => cardHeight(card)).toBeGreaterThan(300);
    await expect
      .poll(() =>
        card
          .locator('[data-study-face="front"]')
          .evaluate((face) => face.parentElement!.scrollHeight <= face.parentElement!.clientHeight),
      )
      .toBe(true);
    const measurementLayout = await card
      .locator('[data-study-sizing-face]')
      .first()
      .evaluate((face) => {
        const wrapper = face.parentElement!;
        const documentWidth = document.documentElement.scrollWidth;
        wrapper.style.display = 'none';
        const widthWithoutMeasurements = document.documentElement.scrollWidth;
        wrapper.style.removeProperty('display');
        return {
          wrapperHeight: wrapper.getBoundingClientRect().height,
          overflow: getComputedStyle(wrapper).overflow,
          measurementWidthAdded: documentWidth - widthWithoutMeasurements,
        };
      });
    expect(measurementLayout).toEqual({
      wrapperHeight: 0,
      overflow: 'hidden',
      measurementWidthAdded: 0,
    });
    await expect
      .poll(async () => Math.abs((await cardHeight(card)) - (await measuredFaceHeight(card))))
      .toBeLessThan(1);
    const frontHeight = await cardHeight(card);
    await page
      .getByRole('button', { name: /Show answer/i })
      .last()
      .click();
    await expect(card.locator('[data-study-face="back"]')).toBeVisible();
    await expect.poll(() => cardHeight(card)).toBe(frontHeight);
    expect(
      await card
        .locator('[data-study-face="back"]')
        .evaluate((face) => face.parentElement!.scrollHeight <= face.parentElement!.clientHeight),
    ).toBe(true);
    await card.getByRole('button', { name: 'Hide answer' }).click();
    await expect(card.locator('[data-study-face="front"]')).toBeVisible();
  }
});

test('anchors a sequence cue to its answer when the card flips', async ({ page }) => {
  await enterFreshLacuna(page);
  await createCourse(page, 'Monarchs');
  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  const lessonId = await lessonIdForCourse(page, courseId!);
  expect(lessonId).toBeTruthy();

  await page.goto(`/#/course/${courseId}/lesson/${lessonId}/sequence/new`);
  await page.getByRole('textbox', { name: 'Sequence name' }).fill('English monarchs');
  await page.getByRole('textbox', { name: 'Item 1 content' }).fill('King William the Conqueror');
  await page.getByRole('button', { name: /Add another item/ }).click();
  await page.getByRole('textbox', { name: 'Item 2 content' }).fill('King William II');
  await page.getByRole('button', { name: 'Add sequence' }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/lesson/${lessonId}$`));

  await page.goto('/#/');
  const studyCourse = page.getByRole('button', { name: 'Study Monarchs' });
  await expect(studyCourse).toBeVisible();
  await studyCourse.click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  const card = page.locator('[data-study-card-id]').first();
  await expect(card.locator('[data-study-face="front"]')).toBeVisible();

  // Scheduling can serve either sequence card first. Advance only if the cue
  // whose alignment this test measures is not already on the current front.
  if (
    (await card
      .locator('[data-study-face="front"]')
      .getByText('King William the Conqueror', { exact: true })
      .count()) === 0
  ) {
    await page
      .getByRole('button', { name: /Show answer/i })
      .last()
      .click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
  }

  const secondCard = page.locator('[data-study-card-id]').filter({
    has: page
      .locator('[data-study-face="front"]')
      .getByText('King William the Conqueror', { exact: true }),
  });
  await expect(secondCard).toBeVisible();
  const frontPrimary = secondCard
    .locator('[data-study-face="front"]')
    .getByText('King William the Conqueror', { exact: true });
  await expect.poll(async () => Math.abs(await centreOffsetFromCard(frontPrimary))).toBeLessThan(2);
  await page
    .getByRole('button', { name: /Show answer/i })
    .last()
    .click();
  const backPrimary = page
    .locator('[data-study-card-id]')
    .locator('[data-study-face="back"]')
    .getByText('King William II', { exact: true });
  await expect(backPrimary).toBeVisible();
  await expect.poll(async () => Math.abs(await centreOffsetFromCard(backPrimary))).toBeLessThan(2);
});

for (const width of [1280, 390]) {
  test(`keeps a typed card anchored through reveal and hide at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await createCourse(page, 'Typed alignment');
    await page.getByRole('button', { name: 'Author mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).click();
    await page.getByRole('textbox', { name: 'Front' }).fill('Translate the phrase');
    await page.getByRole('textbox', { name: 'Back' }).fill('a lighter timetable');
    await page.getByLabel('Card answer mode', { exact: true }).selectOption('type');
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page).not.toHaveURL(/\/cards\/new$/);
    await page.getByRole('link', { name: 'Course', exact: true }).click();
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Choose what to study' })
      .getByRole('button', { name: /^(Start|Continue):/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    await page.getByPlaceholder('Type your answer…').fill('timetable');
    const card = page.locator('[data-study-card-id]').first();
    await expect(card.locator('[data-study-face="front"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const front = (await card.boundingBox())!;
    for (let repeat = 0; repeat < 2; repeat++) {
      await page.getByRole('button', { name: 'Check answer', exact: true }).click();
      await expect(card.locator('[data-study-face="back"]')).toBeVisible();
      await expect
        .poll(async () => Math.abs((await card.boundingBox())!.y - front.y))
        .toBeLessThan(1);
      expect((await card.boundingBox())!.height).toBeCloseTo(front.height, 0);
      await card.getByRole('button', { name: 'Hide answer' }).click();
      await expect(card.locator('[data-study-face="front"]')).toBeVisible();
      await expect
        .poll(async () => Math.abs((await card.boundingBox())!.y - front.y))
        .toBeLessThan(1);
    }

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    for (const inputMode of ['keyboard', 'touch']) {
      await page.evaluate((inputMode) => {
        localStorage.setItem('lacuna.gradingMode', 'manual');
        window.dispatchEvent(new CustomEvent('lacuna:grading-mode'));
        localStorage.setItem('lacuna.inputMode', inputMode);
        window.dispatchEvent(new CustomEvent('lacuna:input-mode'));
      }, inputMode);
      await expect(page.getByPlaceholder('Type your answer…')).toBeFocused();
      for (const destination of ['back', 'front']) {
        const movement = await page.evaluate(async () => {
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
          const card = document.querySelector('[data-study-card-id]')!;
          const initial = card.getBoundingClientRect();
          document
            .querySelector('[data-study-face]')!
            .closest('[role="button"]')!
            .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
          return new Promise<number>((resolve) => {
            const start = performance.now();
            let maximum = 0;
            const sample = () => {
              const next = card.getBoundingClientRect();
              maximum = Math.max(
                maximum,
                Math.abs(next.top - initial.top),
                Math.abs(next.bottom - initial.bottom),
              );
              if (performance.now() - start > 800) resolve(maximum);
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
        });
        expect(movement).toBeLessThan(1);
        await expect(card.locator(`[data-study-face="${destination}"]`)).toBeVisible();
        if (destination === 'back') {
          await expect(page.getByRole('button', { name: 'Check answer', exact: true })).toHaveCount(
            0,
          );
          await expect(page.getByPlaceholder('Type your answer…')).not.toBeFocused();
        } else {
          await expect(page.getByPlaceholder('Type your answer…')).toBeFocused();
        }
      }
    }
  });
}
