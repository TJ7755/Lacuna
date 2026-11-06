import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '@lacuna/core/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function startTranslation(page: Page) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Translation');
  const courseId = new URL(page.url()).hash.split('/')[2];
  const answer = (id: string) => ({
    maxMarks: 3,
    response: { kind: 'written' as const },
    prerequisiteConceptIds: [],
    allocations: [
      {
        id,
        criterion: 'An accurate translation.',
        maxMarks: 3,
        dimension: 'application' as const,
        targetConceptIds: [],
      },
    ],
  });
  const content: QuestionSet = {
    id: 'translation-set',
    courseId,
    title: 'Translation',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Translate: The cat sat on the mat',
        parts: [
          { id: 'part-a', prompt: 'The cat', subparts: [], answer: answer('a1') },
          { id: 'part-b', prompt: 'sat on the mat', subparts: [], answer: answer('a2') },
        ],
      },
    ],
  };
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
      contentRevisionId: 'translation-revision',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  );
  await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
  return new URL(page.url()).hash.split('/').at(-1)!;
}

function storedDraftText(page: Page, attemptId: string, nodeId: string) {
  return page.evaluate(
    ({ attemptId, nodeId }) =>
      new Promise<string | null>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction('questionSetAttempts', 'readonly');
          const get = transaction.objectStore('questionSetAttempts').get(attemptId);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            const attempt = get.result as
              | {
                  responses?: Array<{
                    nodeId: string;
                    draft?: { kind: string; text?: string };
                  }>;
                }
              | undefined;
            const draft = attempt?.responses?.find((row) => row.nodeId === nodeId)?.draft;
            resolve(draft?.kind === 'written' ? (draft.text ?? '') : null);
          };
          transaction.oncomplete = () => database.close();
        };
      }),
    { attemptId, nodeId },
  );
}

for (const theme of ['light', 'dark'] as const) {
  test(`answer ring stays consistent while typing, ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
    await page.emulateMedia({ colorScheme: theme });
    const attemptId = await startTranslation(page);
    const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
    const resting = await answer.evaluate((field) => {
      const style = getComputedStyle(field);
      return { outline: style.outline, shadow: style.boxShadow, focused: true };
    });
    expect(resting.outline).toContain('solid');
    const sampling = answer.evaluate(
      (field) =>
        new Promise<string[]>((resolve) => {
          const samples = new Set<string>();
          const end = performance.now() + 1800;
          const sample = () => {
            const style = getComputedStyle(field);
            samples.add(
              JSON.stringify({
                outline: style.outline,
                shadow: style.boxShadow,
                focused: document.activeElement === field,
              }),
            );
            if (performance.now() < end) requestAnimationFrame(sample);
            else resolve([...samples]);
          };
          sample();
        }),
    );
    await answer.pressSequentially('Le chat ici', { delay: 80 });
    const samples = await sampling;
    await expect.poll(() => storedDraftText(page, attemptId, 'part-a')).toBe('Le chat ici');
    await testInfo.attach(`steady-answer-ring-${theme}`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect(samples).toEqual([JSON.stringify(resting)]);
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`part transition preserves the answer field with ${reducedMotion} motion`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion });
    const attemptId = await startTranslation(page);
    const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
    const emptyHeight = await answer.evaluate((field) => field.clientHeight);
    const draft = 'A line of working.\n'.repeat(30);
    await answer.fill(draft);
    await expect.poll(() => storedDraftText(page, attemptId, 'part-a')).toBe(draft);
    await expect
      .poll(() => answer.evaluate((field) => field.clientHeight))
      .toBeGreaterThan(emptyHeight + 40);
    // Wait for the initial typing resize to settle before measuring navigation itself.
    await page.locator('article.qs-paper').evaluate(
      (paper) =>
        new Promise<void>((resolve, reject) => {
          let height = paper.clientHeight;
          let steady = 0;
          const deadline = performance.now() + 2000;
          const sample = () => {
            const next = paper.clientHeight;
            steady = next === height ? steady + 1 : 0;
            height = next;
            if (steady >= 6) resolve();
            else if (performance.now() > deadline)
              reject(new Error('Answer surface did not settle'));
            else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }),
    );
    await testInfo.attach('before-next-part', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    await expect(page.getByRole('button', { name: 'Next part', exact: true })).toBeEnabled();
    const samples = await page.locator('article.qs-paper').evaluate(
      (paper) =>
        new Promise<
          Array<{ height: number; incoming: boolean; fieldHeight: number; fieldWidth: number }>
        >((resolve) => {
          const frames: Array<{
            height: number;
            incoming: boolean;
            fieldHeight: number;
            fieldWidth: number;
          }> = [];
          const deadline = performance.now() + 1400;
          const sample = () => {
            const field = paper.querySelector<HTMLTextAreaElement>('textarea:not([inert] *)')!;
            const heading = paper.querySelector('h2:not([inert] *)');
            frames.push({
              height: paper.clientHeight,
              incoming: heading?.textContent?.trim() === 'Q1 (b)',
              fieldHeight: field.clientHeight,
              fieldWidth: field.clientWidth,
            });
            if (performance.now() < deadline) requestAnimationFrame(sample);
            else resolve(frames);
          };
          sample();
          paper.querySelector<HTMLButtonElement>('[data-attempt-primary]')!.click();
        }),
    );
    await testInfo.attach('part-transition-frames', {
      body: JSON.stringify(samples),
      contentType: 'application/json',
    });
    await expect(page.getByRole('heading', { name: 'Q1 (b)', exact: true })).toBeVisible();
    await expect(answer).toBeFocused();
    await expect(answer).toHaveValue('');
    const incoming = samples.filter((frame) => frame.incoming);
    expect(incoming.length).toBeGreaterThan(1);
    const start = samples[0].height;
    const end = samples.at(-1)!.height;
    expect(start - end).toBeGreaterThan(40);
    const intermediate = new Set(
      samples
        .filter((frame) => frame.height > end + 2 && frame.height < start - 2)
        .map((frame) => frame.height),
    );
    if (reducedMotion === 'reduce') expect(intermediate.size).toBe(0);
    else expect(intermediate.size).toBeGreaterThanOrEqual(2);
    // Surface height may flow, but the newly mounted textbox must never stretch with it.
    expect(new Set(incoming.map((frame) => frame.fieldHeight))).toEqual(new Set([emptyHeight]));
    expect(new Set(incoming.map((frame) => frame.fieldWidth)).size).toBe(1);
    await testInfo.attach('after-next-part', {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
  });
}

for (const viewport of [
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`attempt layout at ${viewport.width}×${viewport.height}, ${theme}`, async ({
      page,
    }, testInfo) => {
      await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
      await page.emulateMedia({ colorScheme: theme });
      const attemptId = await startTranslation(page);
      await page.setViewportSize(viewport);
      const card = page.locator('article.qs-paper');
      const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
      const primary = page.locator('[data-attempt-primary]');
      const capture = async (state: string) => {
        await expect(card.locator('[inert]')).toHaveCount(0);
        await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
        await page.screenshot({
          path: testInfo.outputPath(`${state}.png`),
          animations: 'disabled',
        });
        await testInfo.attach(state, {
          path: testInfo.outputPath(`${state}.png`),
          contentType: 'image/png',
        });
      };
      const assertFits = async () => {
        const dimensions = await page.evaluate(() =>
          [document.documentElement, document.body, ...document.querySelectorAll('main')].map(
            (element) => ({
              height: element.clientHeight,
              scrollHeight: element.scrollHeight,
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
            }),
          ),
        );
        for (const row of dimensions) {
          expect(row.scrollHeight).toBeLessThanOrEqual(row.height);
          expect(row.scrollWidth).toBeLessThanOrEqual(row.width);
        }
        await expect(primary).toBeInViewport();
      };
      await expect(card.getByRole('button', { name: 'Next part', exact: true })).toBeVisible();
      await expect(page.getByText('Your answer', { exact: true })).toHaveCount(0);
      await expect(page.getByText('Saved', { exact: true })).toHaveCount(0);
      await assertFits();
      const header = page.locator('.qs-practice-header');
      const exit = header.getByRole('button', { name: 'Exit', exact: true });
      await expect(exit).toHaveCount(1);
      await expect(header.getByRole('button', { name: 'Finish for now' })).toHaveCount(0);
      await expect(header.getByRole('button', { name: 'Save and finish later' })).toHaveCount(0);
      const stepper = header.locator('.qs-part-stepper');
      const segments = stepper.locator('.qs-part-segment');
      const uncompletedColour = await segments
        .nth(1)
        .evaluate((node) => getComputedStyle(node).backgroundColor);
      await expect(segments.nth(0)).toHaveCSS('background-color', uncompletedColour);
      const headerBoxes = async () => ({
        exit: await exit.boundingBox(),
        stepper: await stepper.boundingBox(),
      });
      const initialHeader = await headerBoxes();
      const assertCentred = async () => {
        const bar = (await stepper.boundingBox())!;
        const frame = (await header.boundingBox())!;
        expect(Math.abs(bar.x + bar.width / 2 - (frame.x + frame.width / 2))).toBeLessThanOrEqual(
          1,
        );
      };
      await assertCentred();
      const fieldHeight = (await answer.boundingBox())!.height;
      await answer.fill('A line of working.\n'.repeat(30));
      await expect
        .poll(async () => (await answer.boundingBox())!.height)
        .toBeGreaterThan(fieldHeight);
      await assertFits();
      for (const text of ['Le chat', 'Le chat!', 'Le chat']) {
        await answer.fill(text);
        await expect(page.getByText('Saving…', { exact: true })).toHaveCount(0);
        await expect(page.getByText('Not saved', { exact: true })).toHaveCount(0);
        await expect.poll(() => storedDraftText(page, attemptId, 'part-a')).toBe(text);
        expect(await headerBoxes()).toEqual(initialHeader);
      }
      await expect.poll(async () => (await answer.boundingBox())!.height).toBe(fieldHeight);
      await capture('answering');
      await answer.press('Control+Enter');
      await expect(page.getByRole('heading', { name: 'Q1 (b)', exact: true })).toBeVisible();
      await expect(answer).toBeFocused();
      await expect(
        card.getByRole('button', { name: 'Submit question', exact: true }),
      ).toBeVisible();
      await assertFits();
      await answer.fill('s’est assis sur le tapis');
      await answer.press('Control+Enter');
      const award = page.getByRole('radio', { name: '3 / 3', exact: true });
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await assertCentred();
      await capture('marking');
      await award.focus();
      await award.press('Space');
      await expect(award).toBeChecked();
      await expect(segments.nth(0)).not.toHaveCSS('background-color', uncompletedColour);
      await expect(segments.nth(1)).toHaveCSS('background-color', uncompletedColour);
      await expect(primary).toBeEnabled();
      await award.press('Control+Enter');
      await expect(page.getByRole('button', { name: /criterion 2 of 2/ })).toBeVisible();
      await expect(page.getByRole('radio', { name: 'Not marked', exact: true })).toBeFocused();
      await award.focus();
      await award.press('Space');
      await expect(award).toBeChecked();
      await expect(segments.nth(1)).not.toHaveCSS('background-color', uncompletedColour);
      const finishAttempt = card.getByRole('button', { name: 'Finish attempt', exact: true });
      await expect(finishAttempt).toBeEnabled();
      await finishAttempt.click();
      await expect(page.getByRole('link', { name: 'Back to set', exact: true })).toBeFocused();
      await capture('complete');
      await page.getByRole('button', { name: 'Reflection', exact: true }).click();
      const reflection = page.getByRole('dialog', { name: 'Reflection', exact: true });
      await expect(reflection).toBeVisible();
      const reason = reflection.getByRole('checkbox', {
        name: 'Misread the question',
        exact: true,
      });
      await reason.focus();
      await reason.press('Space');
      await expect(reason).toBeChecked();
      await reflection
        .getByRole('textbox', { name: 'Reflection', exact: true })
        .fill('Read the tense.');
      await reflection.getByRole('button', { name: 'Save reflection', exact: true }).click();
      await expect(
        reflection.getByRole('button', { name: 'Save reflection', exact: true }),
      ).toBeDisabled();
      await expect(reflection).toHaveCSS('opacity', '1');
      await capture('reflection');
      await reflection.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(reflection).toBeHidden();
      await page.reload();
      await page.getByRole('button', { name: 'Reflection', exact: true }).click();
      await expect(
        reflection.getByRole('textbox', { name: 'Reflection', exact: true }),
      ).toHaveValue('Read the tense.');
      await expect(
        reflection.getByRole('checkbox', { name: 'Misread the question', exact: true }),
      ).toBeChecked();
    });
  }
}
