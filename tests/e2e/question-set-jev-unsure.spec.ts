import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '../../src/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function openSet(page: Page, diagnostic = false) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Question-set keyboard');
  const courseId = new URL(page.url()).hash.split('/')[2];
  const answer = (id: string) => ({
    maxMarks: 1,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations: [
      {
        id,
        criterion: 'Controls cell activities.',
        maxMarks: 1,
        dimension: 'knowledge' as const,
        targetConceptIds: [],
        ...(diagnostic
          ? {
              techniqueTags: {
                taxonomyId: 'science-explanations' as const,
                taxonomyVersion: 1 as const,
                techniqueIds: ['causal-link' as const],
                provenance: { source: 'author' as const },
              },
            }
          : {}),
      },
    ],
  });
  const content: QuestionSet = {
    id: 'keyboard-set',
    courseId,
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [{ id: 'q1', prompt: 'Describe the nucleus.', parts: [], answer: answer('a1') }],
  };
  // Seed authored content through the real browser store; all attempt writes use the UI.
  await page.evaluate(
    (record) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSets', 'readwrite');
          transaction.objectStore('questionSets').add(record);
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
    {
      ...content,
      contentVersion: 1,
      contentRevisionId: 'keyboard-revision',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  );
  await page.evaluate(() => {
    localStorage.setItem(
      'lacuna.jevSettings',
      JSON.stringify({ enabled: true, acceptedConsentVersion: 2 }),
    );
    localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
  });
  await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Cells', exact: true })).toBeVisible();
}

async function startMarking(page: Page, diagnostic = false) {
  await page.route('**/api/ai/session', (route) =>
    route.fulfill({
      json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 },
    }),
  );
  await openSet(page, diagnostic);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
  await answer.fill(
    diagnostic
      ? 'The nucleus contains genetic material and controls cell activities.'
      : 'It does something in the cell.',
  );
  await answer.press('Control+Enter');
}

async function chooseZero(page: Page) {
  const zero = page.getByRole('radio', { name: '0 / 1', exact: true });
  await zero.focus();
  await zero.press('Space');
  await expect(zero).toBeChecked();
  await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
}

for (const diagnostic of [false, true])
  test(`saves automatic Unsure on re-entry and permits a numeric override (diagnostic: ${diagnostic})`, async ({
    page,
  }, testInfo) => {
    let calls = 0;
    await page.route('**/api/ai/jev', (route) => {
      calls++;
      expect(route.request().postDataJSON().allocations[0].diagnostic).toEqual(
        diagnostic
          ? {
              taxonomyId: 'science-explanations',
              taxonomyVersion: 1,
              techniqueIds: ['causal-link'],
            }
          : undefined,
      );
      return route.fulfill({
        json: {
          model: 'jev-1.14.0',
          inputTokens: 20,
          decisions: [
            {
              value: null,
              confidence: 0.5,
              model: 'jev-1.14.0',
              ...(diagnostic
                ? {
                    diagnosis: {
                      taxonomyId: 'science-explanations',
                      taxonomyVersion: 1,
                      decisions: [
                        { categoryId: 'knowledge', outcome: 'no-gap', confidence: 0.99 },
                        {
                          categoryId: 'application',
                          outcome: 'insufficient-evidence',
                          confidence: 0.6,
                        },
                        {
                          categoryId: 'causal-link',
                          outcome: 'insufficient-evidence',
                          confidence: 0.99,
                        },
                      ],
                    },
                  }
                : {}),
            },
          ],
        },
      });
    });
    await startMarking(page, diagnostic);
    await expect(
      page.getByText('Marking this answer automatically…', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Marking this answer automatically…', { exact: true })).toHaveCount(
      0,
    );
    await page.screenshot({
      path: testInfo.outputPath('low-confidence.png'),
      animations: 'disabled',
    });
    const unsure = page.getByRole('radio', { name: 'Unsure', exact: true });
    await expect(unsure).toBeChecked();
    await expect(
      page.getByText('Automatic marking was not sure enough. Choose a mark.', { exact: true }),
    ).toHaveCount(0);
    const attemptUrl = page.url();
    await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
    await page.goto(attemptUrl);
    await expect(unsure).toBeChecked();
    await page.reload();
    await expect(unsure).toBeChecked();
    expect(calls).toBe(1);
    await chooseZero(page);
    await page.reload();
    await expect(page.getByRole('radio', { name: '0 / 1', exact: true })).toBeChecked();
    expect(calls).toBe(1);
    if (diagnostic) {
      const receipts = await page.evaluate(
        () =>
          new Promise<unknown[]>((resolve, reject) => {
            const request = indexedDB.open('lacuna');
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
              const database = request.result;
              const transaction = database.transaction('questionSetAttempts', 'readonly');
              const read = transaction.objectStore('questionSetAttempts').getAll();
              transaction.oncomplete = () => {
                database.close();
                resolve(read.result.flatMap((attempt) => attempt.jevAssessmentReceipts ?? []));
              };
              transaction.onerror = () => {
                database.close();
                reject(transaction.error);
              };
            };
          }),
      );
      expect(receipts).toEqual([
        expect.objectContaining({
          mark: null,
          marking: expect.objectContaining({ confidence: 0.5 }),
          diagnosis: expect.objectContaining({ taxonomyId: 'science-explanations' }),
        }),
      ]);
    }
  });

test('retains a learner mark chosen while a low-confidence result is in flight', async ({
  page,
}) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ai/jev', async (route) => {
    await response;
    await route.fulfill({
      json: {
        model: 'jev-1.14.0',
        inputTokens: 20,
        decisions: [{ value: null, confidence: 0.5, model: 'jev-1.14.0' }],
      },
    });
  });
  await startMarking(page);
  await expect(page.getByText('Marking this answer automatically…', { exact: true })).toBeVisible();
  await chooseZero(page);
  const verdict = page.waitForResponse('**/api/ai/jev');
  release();
  await verdict;
  await page.reload();
  await expect(page.getByRole('radio', { name: '0 / 1', exact: true })).toBeChecked();
});

for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`preserves a throttled answer and manual mark (${viewport.width}px)`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.route('**/api/ai/session', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '60', 'X-Lacuna-AI-Limit': 'session-minute' },
        body: 'Too many attempts.',
      }),
    );
    await openSet(page);
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
    await answer.fill('The nucleus controls cell activities.');
    await answer.press('Control+Enter');
    await expect(
      page.getByText('Automatic marking is paused. Choose a mark.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Original answer')).toContainText(
      'The nucleus controls cell activities.',
    );
    await chooseZero(page);
    const attemptUrl = page.url();
    await page.getByRole('button', { name: 'Save and finish later', exact: true }).click();
    await page.goto('/#/settings#settings-jev');
    const status = page.getByRole('status').filter({ hasText: 'Paused: too many requests.' });
    await expect(status).toContainText('Try again after');
    await expect(status).toContainText('You can still mark answers yourself.');
    await expect(status).not.toContainText('month');
    await status.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: test.info().outputPath(`session-throttle-${viewport.width}.png`),
      animations: 'disabled',
    });
    await page.goto(attemptUrl);
    await page.reload();
    await expect(page.getByLabel('Original answer')).toContainText(
      'The nucleus controls cell activities.',
    );
    await expect(page.getByRole('radio', { name: '0 / 1', exact: true })).toBeChecked();
  });
}
