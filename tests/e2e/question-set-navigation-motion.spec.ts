import { expect, test, type Page } from '@playwright/test';
import type { QuestionSet } from '../../src/questions/questionSets';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function openSet(page: Page) {
  await enterFreshLacuna(page);
  await createCourse(page, 'Question-set transitions');
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
      },
    ],
  });
  const content: QuestionSet = {
    id: 'keyboard-set',
    courseId,
    title: 'Cells',
    lessonIds: [],
    assessmentIds: [],
    questions: [
      {
        id: 'q1',
        prompt: 'Describe the nucleus.',
        parts: [
          { id: 'part-a', prompt: 'State its role.', subparts: [], answer: answer('a1') },
          {
            id: 'part-b',
            prompt: 'Explain its importance.',
            subparts: [],
            answer: answer('a2'),
          },
        ],
      },
      {
        id: 'q2',
        prompt: 'Choose the membrane property.',
        parts: [],
        answer: {
          ...answer('a3'),
          response: {
            kind: 'multiple-choice',
            selection: 'single',
            options: [
              { id: 'permeable', content: 'Selectively permeable' },
              { id: 'impermeable', content: 'Impermeable' },
            ],
            correctOptionIds: ['permeable'],
          },
        },
      },
    ],
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
  await page.goto(`/#/course/${courseId}/question-sets/${content.id}`);
  await expect(page.getByRole('heading', { name: 'Cells', exact: true })).toBeVisible();
}

test.use({ video: 'on' });

test.describe('Overview mode replacement', () => {
  test.use({ viewport: { width: 1470, height: 956 }, deviceScaleFactor: 2 });

  test('keeps the feedback description continuous during rapid mode reversals', async ({
    page,
  }, testInfo) => {
    await openSet(page);
    const paper = page.getByRole('button', { name: 'Paper', exact: true });
    await paper.focus();
    const frames = await page.evaluate(async () => {
      const group = document.querySelector('[aria-label="Attempt mode"]')!;
      const paper = Array.from(group.querySelectorAll('button')).find(
        (el) => el.textContent === 'Paper',
      )!;
      const practice = Array.from(group.querySelectorAll('button')).find(
        (el) => el.textContent === 'Practice',
      )!;
      const frames: { time: number; phase: string; paper: number; practice: number }[] = [];
      const opacity = (text: string) => {
        const paragraph = Array.from(document.querySelectorAll('p')).find(
          (el) => el.textContent === text,
        );
        if (!paragraph) return 0;
        let opacity = 1;
        for (let el: HTMLElement | null = paragraph; el; el = el.parentElement) {
          opacity *= Number(getComputedStyle(el).opacity);
        }
        return opacity;
      };
      const start = performance.now();
      let phase: 'paper' | 'practice' | 'paper-return' = 'paper';
      paper.click();
      await new Promise<void>((resolve) => {
        const sample = () => {
          const time = performance.now() - start;
          const paperOpacity = opacity('Feedback at the end');
          const practiceOpacity = opacity('Feedback after each question');
          frames.push({ time, phase, paper: paperOpacity, practice: practiceOpacity });
          if (phase === 'paper' && paperOpacity > 0) {
            phase = 'practice';
            practice.focus();
            practice.click();
          } else if (phase === 'practice' && practiceOpacity > 0) {
            phase = 'paper-return';
            paper.focus();
            paper.click();
          }
          if (time < 650) requestAnimationFrame(sample);
          else resolve();
        };
        requestAnimationFrame(sample);
      });
      return frames;
    });
    await testInfo.attach('overview-mode-frames', {
      body: JSON.stringify(frames, null, 2),
      contentType: 'application/json',
    });
    expect(frames.some((frame) => frame.paper > 0 && frame.paper < 0.95)).toBe(true);
    expect(
      frames.some(
        (frame) => frame.phase === 'practice' && frame.practice > 0 && frame.practice < 0.95,
      ),
    ).toBe(true);
    expect(frames.at(-1)!.paper).toBe(1);
    expect(frames.at(-1)!.practice).toBe(0);
    await expect(paper).toBeFocused();
    await expect(paper).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('Feedback at the end', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Feedback after each question', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  });
});

for (const width of [1280, 390]) {
  test(`navigation transitions in both directions at ${width}px`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openSet(page);
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
    await page
      .getByRole('textbox', { name: 'Your answer', exact: true })
      .fill('Controls cell activities.');
    for (const [label, heading, direction] of [
      ['Next', 'Q1 (b)', 1],
      ['Previous', 'Q1 (a)', -1],
    ] as const) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeEnabled();
      const frames = await page.evaluate(
        async ({ label, heading }) => {
          const samples: { opacity: number; x: number; time: number }[] = [];
          const start = performance.now();
          const done = new Promise<typeof samples>((resolve) => {
            const sample = () => {
              const surface = Array.from(
                document.querySelectorAll('.qs-paper > .relative > div'),
              ).find(
                (element) =>
                  !element.hasAttribute('inert') && element.textContent?.includes(heading),
              );
              if (surface) {
                const style = getComputedStyle(surface);
                samples.push({
                  opacity: Number(style.opacity),
                  x: new DOMMatrixReadOnly(style.transform).m41,
                  time: performance.now() - start,
                });
              }
              if (performance.now() - start < 650) requestAnimationFrame(sample);
              else resolve(samples);
            };
            requestAnimationFrame(sample);
          });
          (
            document.querySelector(
              `.qs-preview-nav button[aria-label="${label}"]`,
            ) as HTMLButtonElement
          ).click();
          return done;
        },
        { label, heading },
      );
      await testInfo.attach(`${label}-frames`, {
        body: JSON.stringify(frames, null, 2),
        contentType: 'application/json',
      });
      await page.screenshot({ path: testInfo.outputPath(`${label}-${width}.png`) });
      expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 0.95)).toBe(true);
      expect(frames.some((frame) => frame.x * direction > 1)).toBe(true);
      expect(frames.at(-1)!.x).toBe(0);
      expect(frames.at(-1)!.opacity).toBe(1);
      await expect(page.locator('.qs-paper > .relative > div')).toHaveCount(1);
      await expect(page.getByRole('textbox', { name: 'Your answer', exact: true })).toBeFocused();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
    const answer = page.getByRole('textbox', { name: 'Your answer', exact: true });
    await expect(answer).toHaveValue('Controls cell activities.');
    await expect(page.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    // Reverse before slow motion can settle; writes, not decoration, gate navigation.
    await page.evaluate(() => {
      localStorage.setItem('lacuna.motionSpeed', 'slow');
      window.dispatchEvent(new CustomEvent('lacuna:motion-speed', { detail: 'slow' }));
    });
    for (const label of ['Next', 'Previous', 'Next', 'Previous']) {
      await page.getByRole('button', { name: label, exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Q1 (a)', exact: true })).toBeVisible();
    await expect(answer).toHaveValue('Controls cell activities.');
    await expect(answer).toBeFocused();
    await expect(page.locator('.qs-paper > .relative > div')).toHaveCount(1);
    await page.reload();
    await expect(answer).toHaveValue('Controls cell activities.');
    await expect(page.getByRole('heading', { name: 'Q1 (a)', exact: true })).toBeVisible();
  });
}
