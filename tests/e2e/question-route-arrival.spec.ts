import { expect, test, type Page } from '@playwright/test';
import type {
  Concept,
  FixedQuestionDefinition,
  QuestionAttempt,
  QuestionConceptSet,
} from '@lacuna/core/questions/types';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { readAll } from './fixtures/syncConvergence';

async function seedQuestion(page: Page, courseId: string) {
  const now = Date.now();
  const concept: Concept = {
    id: 'route-addition-concept',
    scope: 'course',
    scopeKey: `course:${courseId}`,
    courseId,
    name: 'Addition',
    provisional: false,
    createdAt: now,
    updatedAt: now,
  };
  const question: FixedQuestionDefinition = {
    id: 'route-addition-question',
    courseId,
    primaryLessonId: null,
    additionalLessonIds: [],
    name: 'Addition application',
    tags: [],
    suspended: false,
    kind: 'fixed',
    prompt: 'Calculate **3 + 3**.',
    payload: { v: 1, kind: 'numeric', answer: { kind: 'exact', value: '6' } },
    explanation: 'Adding three and three gives six.',
    explanationStatus: 'authored',
    contentVersion: 1,
    contentRevisionId: 'route-question-content',
    authoringRevisionId: 'route-question-authoring',
    authoringUpdatedAt: now,
    scheduleEpoch: {
      id: 'route-question-epoch',
      startedAt: now,
      reason: 'created',
      baseline: { kind: 'new' },
    },
    stability: null,
    difficulty: null,
    lastReviewed: null,
    reps: 0,
    lapses: 0,
    state: 0,
    due: null,
    scheduledDays: 0,
    learningSteps: 0,
    scheduleUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const links: QuestionConceptSet = {
    questionId: question.id,
    courseId,
    targetConceptIds: [concept.id],
    prerequisiteConceptIds: [],
    authoringRevisionId: question.authoringRevisionId,
    authoringUpdatedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  // Only authored content is seeded. The real session creates its own attempt.
  await page.evaluate(
    ({ concept, question, links }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction(
            ['concepts', 'questions', 'questionConcepts'],
            'readwrite',
          );
          transaction.objectStore('concepts').add(concept);
          transaction.objectStore('questions').add(question);
          transaction.objectStore('questionConcepts').add(links);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onabort = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    { concept, question, links },
  );
  return question;
}

test('opening another course Question session does not retain the first empty session', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const firstUrl = await createCourse(page, 'Empty question course', false);
  const firstId = new URL(firstUrl).hash.split('/')[2];
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const secondUrl = await createCourse(page, 'Addition question course', false);
  const secondId = new URL(secondUrl).hash.split('/')[2];
  const question = await seedQuestion(page, secondId);
  expect(await readAll(page, 'questionAttempts')).toHaveLength(0);

  await page.evaluate((id) => {
    window.location.hash = `#/course/${id}/questions/learn`;
  }, firstId);
  await expect(page.getByRole('heading', { name: 'No Questions to practise' })).toBeVisible();

  await page.evaluate(() => {
    const messages: string[] = [];
    document.documentElement.dataset.questionRouteMessages = JSON.stringify(messages);
    new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const headings = node.matches('h1') ? [node] : node.querySelectorAll('h1');
          for (const heading of headings) {
            const text = heading.textContent?.trim() ?? '';
            if (text === 'Session complete' || text === 'No Questions to practise')
              messages.push(text);
          }
        }
      }
      document.documentElement.dataset.questionRouteMessages = JSON.stringify(messages);
    }).observe(document.body, { childList: true, subtree: true });
  });
  // A hash change keeps the document and router alive, exposing accidental session reuse.
  await page.evaluate((id) => {
    window.location.hash = `#/course/${id}/questions/learn`;
  }, secondId);

  await expect(page.getByText('3 + 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No Questions to practise' })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.dataset.questionRouteMessages)).toBe(
    '[]',
  );
  expect(await readAll<QuestionAttempt>(page, 'questionAttempts')).toMatchObject([
    { questionId: question.id, courseId: secondId, status: 'shown' },
  ]);

  await page.mouse.move(0, 0);
  const screenshot = info.outputPath('second-course-question-arrival.png');
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  await info.attach('second-course-question-arrival', {
    path: screenshot,
    contentType: 'image/png',
  });
});
