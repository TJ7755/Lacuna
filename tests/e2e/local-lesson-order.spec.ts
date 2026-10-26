import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';

async function importSchoolScience(
  page: Page,
  unlockMode: 'open' | 'semi-linear' = 'open',
  publishedCheckpoint = true,
  practiceAfterEveryLesson = false,
  lessonIds = ['A', 'B', 'C'],
) {
  await enterFreshLacuna(page);
  await openImport(page);
  const examDate = Date.now() + 90 * 86_400_000;
  const payload = {
    v: 5,
    by: 'Teacher',
    at: 1000,
    li: 'local-order-science',
    rv: 1,
    course: { n: 'School science', o: 0, c: 1000, e: examDate, um: unlockMode },
    lessons: lessonIds.map((id) => ({
      i: id,
      n: `Topic ${id}`,
      notes: [],
      cards: [
        { id: `card-${id}`, k: 0, f: `${id} recall`, b: `${id} answer`, co: `concept-${id}` },
      ],
    })),
    exams: [
      {
        id: 'checkpoint',
        n: 'Topic test',
        e: examDate - 30 * 86_400_000,
        k: 'c',
        a: 0,
        m: 'p',
        c: 1000,
      },
      { id: 'final', n: 'Final exam', e: examDate, k: 'f', a: null, m: 'p', c: 1000 },
    ],
    concepts: lessonIds.map((id) => ({ id: `concept-${id}`, n: `Concept ${id}` })),
    questions: [],
    questionSets: [
      {
        id: 'set',
        courseId: 'source',
        title: 'Topic C questions',
        lessonIds: ['C'],
        assessmentIds: [],
        questions: [
          {
            id: 'written',
            prompt: 'Explain C',
            parts: [],
            answer: {
              maxMarks: 1,
              response: { kind: 'written' },
              prerequisiteConceptIds: [],
              allocations: [
                {
                  id: 'mark',
                  criterion: 'Explains C',
                  maxMarks: 1,
                  dimension: 'knowledge',
                  targetConceptIds: ['concept-C'],
                },
              ],
            },
          },
        ],
        contentVersion: 1,
        contentRevisionId: 'set-v1',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    questionSetPracticeNodes: [
      {
        id: 'activity',
        courseId: 'source',
        type: 'question-set',
        name: 'Topic C questions',
        questionSetIds: ['set'],
        afterLessonId: 'C',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
  };
  if (practiceAfterEveryLesson) {
    const questionSet = payload.questionSets[0];
    const practice = payload.questionSetPracticeNodes[0];
    payload.questionSets = lessonIds.map((id) => ({
      ...questionSet,
      id: `set-${id}`,
      title: `Topic ${id} questions`,
      lessonIds: [id],
      questions: questionSet.questions.map((question) => ({ ...question, id: `written-${id}` })),
    }));
    payload.questionSetPracticeNodes = lessonIds.map((id) => ({
      ...practice,
      id: `activity-${id}`,
      name: `Topic ${id} questions`,
      questionSetIds: [`set-${id}`],
      afterLessonId: id,
    }));
  }
  if (practiceAfterEveryLesson) {
    const extra = payload.questionSets[2];
    payload.questionSets.push({
      ...extra,
      id: 'set-C-extra',
      title: 'Topic C extra questions',
      questions: extra.questions.map((question) => ({ ...question, id: 'written-C-extra' })),
    });
    payload.questionSetPracticeNodes[2].questionSetIds.push('set-C-extra');
  }
  if (!publishedCheckpoint) payload.exams = payload.exams.filter((exam) => exam.k === 'f');
  await page.getByLabel('Import file').setInputFiles({
    name: 'School science.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ format: 'lacuna-course', version: 1, payload, assets: [] }),
    ),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page.getByRole('radio', { name: /Exam date/ }).press('Space');
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  await page.goto('/#/');
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'School science', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  return page.url();
}

test('keeps automatic practice and checkpoint coverage when a locked course is reordered', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const courseUrl = await importSchoolScience(page);
  await page.goto(`${courseUrl}/settings`);
  await page.getByRole('button', { name: /^Auto-practice/ }).click();
  await expect(page.getByRole('switch', { name: 'Auto-practice', exact: true })).toBeChecked();
  await page.getByRole('button', { name: /^Lessons/ }).click();
  await page.getByRole('button', { name: 'Move Topic C up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Topic B down', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Move Topic C up', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Move Topic C up', exact: true })).toBeDisabled();
  await page.screenshot({
    path: test.info().outputPath('local-order-settings.png'),
    animations: 'disabled',
  });
  await page.reload();
  await page.getByRole('button', { name: /^Lessons/ }).click();
  await expect(page.getByRole('button', { name: 'Move Topic C up', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Use publisher order' })).toBeVisible();
  await page.goto(courseUrl);
  const path = page.getByRole('list', { name: 'Course path' });
  await expect
    .poll(async () =>
      path
        .locator('[data-path-source]')
        .evaluateAll((rows) =>
          rows
            .map((row) => row.getAttribute('data-path-source'))
            .filter((id) => ['A', 'B', 'C', 'checkpoint'].includes(id ?? '')),
        ),
    )
    .toEqual(['C', 'A', 'checkpoint', 'B']);
  await page.screenshot({
    path: test.info().outputPath('local-order-path.png'),
    animations: 'disabled',
  });
  await path.getByRole('button', { name: 'Open checkpoint: Topic test', exact: true }).click();
  const details = page.getByRole('dialog', { name: 'Topic test details' });
  await expect(details.getByRole('listitem')).toHaveText(['Topic C', 'Topic A']);
  await expect(details.getByText('2 lessons · 2 cards', { exact: true })).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath('local-order-checkpoint.png'),
    animations: 'disabled',
  });
});

async function publisherRecords(page: Page) {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown[]>>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const names = [
            'lessons',
            'courseAssessments',
            'practiceNodes',
            'reviewHistory',
            'lessonCardExposures',
          ];
          const transaction = database.transaction(names);
          const result: Record<string, unknown[]> = {};
          for (const name of names) {
            const rows = transaction.objectStore(name).getAll();
            rows.onsuccess = () => {
              result[name] = rows.result;
            };
          }
          transaction.oncomplete = () => {
            database.close();
            resolve(result);
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
}

for (const input of [
  { name: 'mouse', width: 1440, touch: false },
  { name: 'touch', width: 390, touch: true },
]) {
  test.describe(`local lesson drag with ${input.name}`, () => {
    test.use({ viewport: { width: input.width, height: 1100 }, hasTouch: input.touch });
    test('moves locked lessons and their questions while keeping study and publisher data locked', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: input.touch ? 'reduce' : 'no-preference' });
      const courseUrl = await importSchoolScience(page, 'semi-linear');
      const path = page.getByRole('list', { name: 'Course path' });
      const row = (id: string) => path.locator(`[data-path-lesson="${id}"] [data-path-row]`);
      const order = () =>
        path
          .locator('[data-path-lesson]')
          .evaluateAll((rows) => rows.map((item) => item.getAttribute('data-path-lesson')));
      const clickLocked = async (id: string) => {
        const bounds = (await row(id).boundingBox())!;
        const x = bounds.x + bounds.width / 2;
        const y = bounds.y + bounds.height / 2;
        if (input.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.click(x, y);
      };
      const before = await publisherRecords(page);
      await expect(row('C')).toHaveAttribute('aria-roledescription', 'sortable path row');
      await expect(row('C')).toHaveAttribute('aria-disabled', 'true');
      await clickLocked('C');
      await expect(page).toHaveURL(courseUrl);
      await row('C').scrollIntoViewIfNeeded();
      const start = (await row('C').boundingBox())!;
      const first = (await row('A').boundingBox())!;
      const x = Math.round(start.x + start.width / 2);
      const y = Math.round(start.y + start.height / 2);
      const targetY = Math.round(first.y + 4);
      if (input.touch) {
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await expect(row('C')).toHaveAttribute('data-drag-lifted', 'true');
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: targetY }],
        });
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await expect(row('C')).toHaveAttribute('data-drag-lifted', 'true');
        await page.mouse.move(x, targetY, { steps: 20 });
        await page.screenshot({
          path: test.info().outputPath('local-order-held.png'),
          animations: 'allow',
        });
        await page.mouse.up();
      }
      await expect.poll(order).toEqual(['C', 'A', 'B']);
      await expect(page).toHaveURL(courseUrl);
      await expect
        .poll(() =>
          path
            .locator('[data-path-source]')
            .evaluateAll((rows) =>
              rows
                .map((item) => item.getAttribute('data-path-source'))
                .filter((id) => ['C', 'activity', 'A', 'checkpoint', 'B'].includes(id ?? '')),
            ),
        )
        .toEqual(['C', 'activity', 'A', 'checkpoint', 'B']);
      await expect(
        path.locator('[data-path-source="activity"] [aria-roledescription="sortable path row"]'),
      ).toHaveCount(1);
      await expect(path.getByRole('button', { name: /^Edit checkpoint/ })).toHaveCount(0);
      await expect(path.getByRole('button', { name: /Delete lesson|Rename lesson/ })).toHaveCount(
        0,
      );
      await expect(row('B')).toHaveAttribute('aria-disabled', 'true');
      await clickLocked('B');
      await expect(page).toHaveURL(courseUrl);
      await row('B').press('Alt+ArrowUp');
      await expect.poll(order).toEqual(['C', 'B', 'A']);
      await page.reload();
      await expect.poll(order).toEqual(['C', 'B', 'A']);
      expect(await publisherRecords(page)).toEqual(before);
      await page.screenshot({
        path: test.info().outputPath(`local-order-${input.name}-saved.png`),
        animations: 'disabled',
      });
    });
  });
}

for (const input of [
  { name: 'mouse', width: 1440, touch: false },
  { name: 'touch', width: 390, touch: true },
]) {
  test.describe(`learner checkpoints with ${input.name}`, () => {
    test.use({ viewport: { width: input.width, height: 1100 }, hasTouch: input.touch });
    test('adds a personal test, edits its date and drags its coverage without changing library content', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: input.touch ? 'reduce' : 'no-preference' });
      await importSchoolScience(page, 'open', false);
      const path = page.getByRole('list', { name: 'Course path' });
      const before = await publisherRecords(page);
      expect(
        (before.courseAssessments as { kind: string }[]).filter((row) => row.kind === 'checkpoint'),
      ).toHaveLength(0);
      const lesson = (id: string) => path.locator(`[data-path-lesson="${id}"] [data-path-row]`);
      await lesson('C').press('Alt+ArrowUp');
      await expect(path.locator('[data-path-lesson]').nth(1)).toHaveAttribute(
        'data-path-lesson',
        'C',
      );
      await lesson('C').press('Alt+ArrowUp');
      await expect(path.locator('[data-path-lesson]').first()).toHaveAttribute(
        'data-path-lesson',
        'C',
      );
      await page
        .locator('[data-path-card]')
        .getByRole('button', { name: 'Add', exact: true })
        .click();
      await expect(page.getByRole('menuitem')).toHaveCount(1);
      await page.getByRole('menuitem', { name: 'Checkpoint', exact: true }).click();
      const add = page.getByRole('dialog', { name: 'Add checkpoint', exact: true });
      await add.getByRole('textbox', { name: 'Name', exact: true }).fill('My mock');
      await add.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(add).toBeHidden();
      const created = (await publisherRecords(page)).courseAssessments as {
        id: string;
        kind: string;
        examDate: number;
      }[];
      const own = created.find((row) => row.kind === 'checkpoint')!;
      expect(own).toBeTruthy();
      await path.getByRole('button', { name: 'Edit checkpoint: My mock', exact: true }).click();
      const edit = page.getByRole('dialog', { name: 'Edit checkpoint', exact: true });
      await edit.getByRole('textbox', { name: 'Name', exact: true }).fill('My mock - updated');
      await edit.getByRole('button', { name: 'Choose date and time', exact: true }).click();
      const calendar = page.getByRole('dialog', { name: 'Choose date and time', exact: true });
      await calendar.getByRole('button', { name: 'Next month', exact: true }).click();
      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1, 15);
      const chosenDate = nextMonth.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      await calendar.getByRole('button', { name: chosenDate, exact: true }).click();
      await calendar.getByRole('textbox', { name: 'Hour', exact: true }).fill('10');
      await calendar.getByRole('textbox', { name: 'Minute', exact: true }).fill('30');
      await calendar.getByRole('button', { name: 'Done', exact: true }).click();
      await edit.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(edit).toBeHidden();
      type TestRecord = {
        id: string;
        examDate: number;
        timeZone?: string;
        afterLessonId: string | null;
      };
      const changed = ((await publisherRecords(page)).courseAssessments as TestRecord[]).find(
        (row) => row.id === own.id,
      )!;
      expect(changed.examDate).not.toBe(own.examDate);
      expect(
        new Intl.DateTimeFormat('en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: changed.timeZone,
        }).format(changed.examDate),
      ).toBe(chosenDate);
      const row = path.getByRole('button', {
        name: 'Edit checkpoint: My mock - updated',
        exact: true,
      });
      await expect(row).toHaveAttribute('aria-roledescription', 'sortable path row');
      await row.scrollIntoViewIfNeeded();
      const start = (await row.boundingBox())!;
      const target = (await path.locator('[data-path-source="activity"]').boundingBox())!;
      const startRow = (await row.locator('xpath=ancestor::li').boundingBox())!;
      const x = Math.round(start.x + 12);
      const y = Math.round(start.y + start.height / 2);
      const targetY = Math.round(target.y + y - startRow.y);
      if (input.touch) {
        const session = await page.context().newCDPSession(page);
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
        await expect(row).toHaveAttribute('data-drag-lifted', 'true');
        await expect(path.locator('[data-drop-active]')).toHaveAttribute(
          'data-drop-active',
          'false',
        );
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: targetY }],
        });
        await expect(path.locator('[data-drop-active]')).toHaveAttribute(
          'data-drop-active',
          'true',
        );
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
        await expect(row).toHaveAttribute('data-drag-lifted', 'true');
        await expect(path.locator('[data-drop-active]')).toHaveAttribute(
          'data-drop-active',
          'false',
        );
        await expect
          .poll(async () =>
            Number(
              await path
                .locator('[data-drop-active]')
                .evaluate((element) => getComputedStyle(element).opacity),
            ),
          )
          .toBeGreaterThan(0.5);
        await page.screenshot({
          path: test.info().outputPath('learner-checkpoint-muted-guide.png'),
          animations: 'allow',
        });
        await page.mouse.move(x, targetY, { steps: 20 });
        await expect(path.locator('[data-drop-active]')).toHaveAttribute(
          'data-drop-active',
          'true',
        );
        await page.screenshot({
          path: test.info().outputPath('learner-checkpoint-held.png'),
          animations: 'allow',
        });
        await page.mouse.up();
      }
      await expect(path.locator('[data-drop-active]')).toHaveCount(0);
      await expect
        .poll(
          async () =>
            ((await publisherRecords(page)).courseAssessments as TestRecord[]).find(
              (item) => item.id === own.id,
            )?.afterLessonId,
        )
        .toBe('C');
      await page.reload();
      await path
        .getByRole('button', { name: 'Edit checkpoint: My mock - updated', exact: true })
        .click();
      await expect(edit.getByText('1 lesson · 1 card', { exact: true })).toBeVisible();
      await page.screenshot({
        path: test.info().outputPath(`learner-checkpoint-${input.name}-editor.png`),
        animations: 'disabled',
      });
      const retained = ((await publisherRecords(page)).courseAssessments as TestRecord[]).find(
        (item) => item.id === own.id,
      )!;
      expect(retained.examDate).toBe(changed.examDate);
      await edit.getByRole('button', { name: 'Delete', exact: true }).click();
      await page
        .getByText('Delete this checkpoint?', { exact: true })
        .locator('..')
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(edit).toBeHidden();
      await expect(
        path.getByRole('button', { name: 'Edit checkpoint: My mock - updated', exact: true }),
      ).toHaveCount(0);
      expect(await publisherRecords(page)).toEqual(before);
    });
  });
}

async function expectSeparatedPathRows(page: Page) {
  const path = page.getByRole('list', { name: 'Course path' });
  await expect
    .poll(async () => {
      return path.locator('[data-path-source]').evaluateAll((rows) => {
        const bounds = rows
          .filter((row) => !row.querySelector('[data-drag-lifted="true"]'))
          .map((row) => {
            const box = row.getBoundingClientRect();
            return { id: row.getAttribute('data-path-source'), top: box.top, bottom: box.bottom };
          })
          .sort((a, b) => a.top - b.top);
        return bounds.flatMap((row, index) => {
          const next = bounds[index + 1];
          return next && row.bottom > next.top + 1
            ? [{ first: row.id, second: next.id, overlap: row.bottom - next.top }]
            : [];
        });
      });
    })
    .toEqual([]);
}

test('keeps lessons and anchored practice rows apart during a checkpoint drag preview', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1200 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await importSchoolScience(page, 'open', false, true);
  const path = page.getByRole('list', { name: 'Course path' });
  await page.locator('[data-path-card]').getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Checkpoint', exact: true }).click();
  const add = page.getByRole('dialog', { name: 'Add checkpoint', exact: true });
  await add.getByRole('textbox', { name: 'Name', exact: true }).fill('My test');
  await add.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(add).toBeHidden();
  const checkpoint = path.getByRole('button', { name: 'Edit checkpoint: My test', exact: true });
  const start = (await checkpoint.boundingBox())!;
  const target = (await path.locator('[data-path-lesson="A"] [data-path-row]').boundingBox())!;
  const x = start.x + 12;
  await page.mouse.move(x, start.y + start.height / 2);
  await page.mouse.down();
  await expect(checkpoint).toHaveAttribute('data-drag-lifted', 'true');
  await page.mouse.move(x, target.y + start.height / 2, { steps: 20 });
  await expect(path.locator('[data-drop-active]')).toHaveAttribute('data-drop-active', 'true');
  await expectSeparatedPathRows(page);
  await page.mouse.up();
});

for (const input of [
  { name: 'mouse', width: 1440, touch: false },
  { name: 'touch', width: 390, touch: true },
]) {
  test.describe(`attached Question Set drag with ${input.name}`, () => {
    test.use({ viewport: { width: input.width, height: 1200 }, hasTouch: input.touch });
    test('moves the parent lesson and attached questions together without editing publisher anchors', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await importSchoolScience(page, 'open', false, true);
      const path = page.getByRole('list', { name: 'Course path' });
      const before = await publisherRecords(page);
      const parent = path.locator('[data-path-source="C"] [data-path-row]');
      const questions = path.locator('[data-path-source="activity-C"] [data-path-row]').first();
      const parentRow = path.locator('[data-path-source="C"]');
      const questionsRow = path.locator('[data-path-source="activity-C"]');
      await expect(questions).toHaveAttribute('aria-roledescription', 'sortable path row');
      await questions.scrollIntoViewIfNeeded();
      const start = (await questions.boundingBox())!;
      const target = (await path.locator('[data-path-lesson="A"] [data-path-row]').boundingBox())!;
      const x = Math.round(start.x + start.width / 2);
      const y = Math.round(start.y + start.height / 2);
      const targetY = Math.round(target.y + 4);
      const session = input.touch ? await page.context().newCDPSession(page) : undefined;
      if (session) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      await expect(questions).toHaveAttribute('data-drag-lifted', 'true');
      await expect(parent).toHaveAttribute('data-drag-lifted', 'true');
      const parentStart = (await parentRow.boundingBox())!;
      const questionsStart = (await questionsRow.boundingBox())!;
      if (session) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y: targetY }],
        });
      } else {
        await page.mouse.move(x, targetY, { steps: 20 });
      }
      await expect
        .poll(async () => {
          const parentNow = (await parentRow.boundingBox())!;
          const questionsNow = (await questionsRow.boundingBox())!;
          const centre = (box: { y: number; height: number }) => box.y + box.height / 2;
          return Math.abs(
            centre(parentNow) -
              centre(parentStart) -
              (centre(questionsNow) - centre(questionsStart)),
          );
        })
        .toBeLessThan(1);
      await expectSeparatedPathRows(page);
      await page.screenshot({
        path: test.info().outputPath(`attached-question-set-${input.name}-held.png`),
        animations: 'allow',
      });
      if (session) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      } else {
        await page.mouse.up();
      }
      const order = () =>
        path
          .locator('[data-path-source]')
          .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-path-source')));
      const expected = ['C', 'activity-C', 'A', 'activity-A', 'B', 'activity-B'];
      await expect.poll(order).toEqual(expected);
      await page.reload();
      await expect.poll(order).toEqual(expected);
      expect(await publisherRecords(page)).toEqual(before);
    });
  });
}

for (const input of [
  { name: 'mouse lesson', width: 1440, touch: false, checkpoint: false },
  { name: 'touch lesson', width: 390, touch: true, checkpoint: false },
  { name: 'mouse checkpoint', width: 1440, touch: false, checkpoint: true },
  { name: 'touch checkpoint', width: 390, touch: true, checkpoint: true },
].flatMap((input) => [
  { ...input, near: false },
  { ...input, name: `${input.name} near edge`, near: true },
])) {
  test.describe(`path drag edge scrolling with ${input.name}`, () => {
    const height = input.near ? 1000 : 650;
    test.use({ viewport: { width: input.width, height }, hasTouch: input.touch });
    test('scrolls continuously at either edge while the held pointer is stationary', async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await importSchoolScience(
        page,
        'open',
        false,
        true,
        input.near ? ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] : undefined,
      );
      const path = page.getByRole('list', { name: 'Course path' });
      let row = path.locator('[data-path-lesson="A"] [data-path-row]');
      if (input.checkpoint) {
        await page
          .locator('[data-path-card]')
          .getByRole('button', { name: 'Add', exact: true })
          .click();
        await page.getByRole('menuitem', { name: 'Checkpoint', exact: true }).click();
        const add = page.getByRole('dialog', { name: 'Add checkpoint', exact: true });
        await add.getByRole('textbox', { name: 'Name', exact: true }).fill('Edge scrolling test');
        await add.getByRole('button', { name: 'Done', exact: true }).click();
        await expect(add).toBeHidden();
        row = path.getByRole('button', {
          name: 'Edit checkpoint: Edge scrolling test',
          exact: true,
        });
        for (const anchor of input.near ? ['G', 'F', 'E', 'D', 'C', 'B', 'A'] : ['B', 'A']) {
          await row.press('Alt+ArrowUp');
          await expect
            .poll(async () => {
              const records = (await publisherRecords(page)).courseAssessments as {
                kind: string;
                afterLessonId: string | null;
              }[];
              return records.find((assessment) => assessment.kind === 'checkpoint')?.afterLessonId;
            })
            .toBe(anchor);
        }
      }
      const scroller = page.getByRole('main');
      await row.scrollIntoViewIfNeeded();
      const start = (await row.boundingBox())!;
      const viewport = (await scroller.boundingBox())!;
      const scrollTop = () => scroller.evaluate((element) => element.scrollTop);
      const before = await scrollTop();
      const maximum = await scroller.evaluate(
        (element) => element.scrollHeight - element.clientHeight,
      );
      const x = Math.round(start.x + (input.checkpoint ? start.width - 20 : start.width / 2));
      const y = Math.round(start.y + start.height / 2);
      const bottomEdge = Math.min(height, viewport.y + viewport.height);
      const distance = input.near ? (input.checkpoint ? 80 : 96) : 8;
      const bottomY = Math.round(bottomEdge - distance);
      const topY = Math.round(Math.max(0, viewport.y) + (input.near ? 80 : 8));
      const session = input.touch ? await page.context().newCDPSession(page) : undefined;
      const move = async (clientY: number) => {
        if (session) {
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x, y: clientY }],
          });
        } else {
          await page.mouse.move(x, clientY);
        }
      };
      if (session) {
        await session.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x, y }],
        });
      } else {
        await page.mouse.move(x, y);
        await page.mouse.down();
      }
      await expect(row).toHaveAttribute('data-drag-lifted', 'true');
      await move(bottomY);
      if (input.near) {
        await expect
          .poll(() =>
            path
              .locator('[data-path-source]')
              .evaluateAll((rows) =>
                Math.max(
                  ...rows
                    .filter((row) => row.querySelector('[data-drag-lifted="true"]'))
                    .map((row) => row.getBoundingClientRect().bottom),
                ),
              ),
          )
          .toBeGreaterThan(bottomEdge - 64);
      }
      await expect.poll(scrollTop).toBeGreaterThan(before + 60);
      const firstAdvance = await scrollTop();
      await expect.poll(scrollTop).toBeGreaterThan(firstAdvance + 40);
      await expect(row).toHaveAttribute('data-drag-lifted', 'true');
      if (input.near && !input.checkpoint) {
        await expect.poll(scrollTop, { timeout: 10000 }).toBeGreaterThanOrEqual(maximum);
        await page.waitForTimeout(180);
        expect(await scrollTop()).toBe(maximum);
      }
      if (input.near)
        await page.screenshot({
          path: test
            .info()
            .outputPath(`near-edge-${input.checkpoint ? 'checkpoint' : 'lesson'}-scroll.png`),
          animations: 'allow',
        });
      const bottomScroll = await scrollTop();
      await move(topY);
      await expect.poll(scrollTop).toBeLessThan(bottomScroll - 60);
      const firstRetreat = await scrollTop();
      await expect.poll(scrollTop).toBeLessThan(firstRetreat - 40);
      await expect(row).toHaveAttribute('data-drag-lifted', 'true');
      if (session) {
        await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await session.detach();
      } else {
        await page.mouse.up();
      }
      await expect(row).not.toHaveAttribute('data-drag-lifted', 'true');
      await expect(path.locator('[data-drop-active]')).toHaveCount(0);
      await page.reload();
      await expect(path.locator('[data-path-lesson]')).toHaveCount(input.near ? 8 : 3);
    });
  });
}
