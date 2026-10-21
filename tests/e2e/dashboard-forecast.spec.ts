import { expect, test, type Page } from '@playwright/test';
import type { Card, Course } from '../../src/db/types';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function populateForecast(page: Page) {
  await enterFreshLacuna(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('lacuna');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ['courses', 'courseAssessments', 'cards', 'reviewHistory'],
          'readwrite',
        );
        const courses = tx.objectStore('courses');
        const cards = tx.objectStore('cards');
        const reviews = tx.objectStore('reviewHistory');
        const assessments = tx.objectStore('courseAssessments');
        courses.getAll().onsuccess = (event) => {
          const original = (event.target as IDBRequest<Course[]>).result[0];
          const day = 86_400_000;
          const now = Date.now();
          courses.clear();
          cards.clear();
          reviews.clear();
          for (const [index, name] of ['Biology', 'Chemistry', 'French', 'New course'].entries()) {
            const course = {
              ...original,
              id: `forecast-${index}`,
              name,
              examDate: index === 2 ? undefined : now + (index === 1 ? 40 : 7) * day,
            };
            courses.put(course);
            assessments.put({
              id: `${course.id}-final`,
              courseId: course.id,
              kind: 'final',
              name: 'Final exam',
              afterLessonId: null,
              coverageMode: 'prefix',
              excludedCardIds: [],
              schedulingMode: index === 2 ? 'steady' : 'exam',
              examDate: course.examDate,
              createdAt: now,
              updatedAt: now,
            });
            if (index === 3) continue;
            for (let k = 0; k < 10; k++) {
              const card: Card = {
                id: `${course.id}-${k}`,
                conceptId: `${course.id}-concept-${k}`,
                courseId: course.id,
                schedulingUnitId: course.id,
                primaryLessonId: null,
                type: 'front_back',
                front: 'Question',
                back: 'Answer',
                stability: 12 + index * 8,
                difficulty: 5,
                lastReviewed: now - day,
                reps: 3,
                lapses: 0,
                state: 2,
                due: now + day,
                scheduledDays: 12,
                learningSteps: 0,
                history: [],
                createdAt: now - 18 * day,
                updatedAt: now,
              };
              cards.put(card);
              for (const [daysAgo, stabilityAfter] of [
                [16, 2],
                [8, 6],
                [1, card.stability!],
              ]) {
                reviews.put({
                  id: `${card.id}-${daysAgo}`,
                  cardId: card.id,
                  courseId: course.id,
                  timestamp: now - daysAgo * day,
                  grade: 3,
                  responseTimeSec: 4,
                  distracted: false,
                  stabilityBefore: null,
                  stabilityAfter,
                  difficultyBefore: null,
                  difficultyAfter: 5,
                  retrievabilityAtReview: null,
                });
              }
            }
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      };
    });
  });
  await page.reload();
}

for (const width of [1440, 390]) {
  test(`exam-day forecast explains and projects populated history at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.setFixedTime(new Date('2026-10-20T12:00:00Z'));
    await populateForecast(page);
    const panel = page.getByRole('region', { name: 'Forecast and this week' });
    const chart = page.getByRole('img', { name: 'Exam-day forecast' });
    await expect(chart).toBeVisible();
    await panel.screenshot({ path: testInfo.outputPath(`forecast-${width}.png`) });
    await expect(chart).toHaveAccessibleDescription(/predicted exam-day recall/i);
    const projections = chart.locator('path[aria-label]');
    await expect(projections).toHaveCount(2);
    for (const path of await projections.all()) {
      await expect(path).toHaveAccessibleName(/If you stop now/);
      await expect(path).toHaveAttribute('stroke-dasharray', /\d/);
      const geometry = await path.evaluate((element) => {
        const path = element as SVGPathElement;
        const length = path.getTotalLength();
        const start = path.getPointAtLength(0);
        const end = path.getPointAtLength(length);
        return { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } };
      });
      expect(geometry.end.x).toBeGreaterThan(geometry.start.x);
      expect(geometry.end.y).toBeCloseTo(geometry.start.y);
    }
    const details = panel.getByRole('list', { name: 'Forecast details' });
    await expect(details.getByText(/French:.*no future exam date/i)).toBeVisible();
    await expect(details.getByText(/New course:.*no study data/i)).toBeVisible();
    // Plotted courses keep an accessible summary without repeating the chart visibly.
    const plotted = details.getByText(/Biology:.*predicted exam-day recall/);
    await expect(plotted).toBeAttached();
    expect((await plotted.boundingBox())?.width ?? 0).toBeLessThanOrEqual(1);
    await expect(chart.getByText('Today', { exact: true })).toBeVisible();
    await expect(chart.getByText(/Exam/)).toHaveCount(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
}
