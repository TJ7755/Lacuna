import { expect, test, type Locator, type Page } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function cardHeight(card: Locator): Promise<number> {
  return card.locator('[data-study-face]').evaluate((face) => face.parentElement!.offsetHeight);
}

async function availableCardHeight(card: Locator): Promise<number> {
  return card.evaluate((card) => card.closest('.study-card-slot')!.clientHeight);
}

async function naturalCardHeight(card: Locator): Promise<number> {
  return card
    .locator('[data-study-sizing-face]')
    .evaluateAll((faces) => Math.max(...faces.map((face) => (face as HTMLElement).offsetHeight)));
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

test('keeps both study-card faces within the remaining viewport height', async ({ page }) => {
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
  await chooseScheduledStudy(page);

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
      .poll(async () =>
        Math.abs(
          (await cardHeight(card)) -
            Math.min(await naturalCardHeight(card), await availableCardHeight(card)),
        ),
      )
      .toBeLessThan(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(900);
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
