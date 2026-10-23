import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type Page, type Route, type TestInfo } from '@playwright/test';
import { openGapsConnection, parseGapsConnectionFile } from '../../src/teacher/connectionFile';
import { createHandler } from '../../relay/src/relay.js';
import { MemoryStore } from '../../relay/src/store.js';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { addLessonCard, editOnlyCard } from './fixtures/syncConvergence';

const RELAY_URL = 'https://relay.getlacuna.app';

for (const width of [1280, 390]) {
  test(`opens the confirmed shared course with heading focus and Study at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const store = new MemoryStore();
    const handle = createHandler(store);
    const minted = await handle(new Request(`${RELAY_URL}/shares`, { method: 'POST' }));
    const { shareId } = (await minted.json()) as { shareId: string };
    const payload = {
      v: 2,
      at: 1000,
      li: 'share-arrival-biology',
      rv: 1,
      course: { n: 'Shared biology', o: 0, c: 1000, um: 'open', sm: 1 },
      lessons: ['Cells', 'Enzymes'].map((name, index) => ({
        i: `arrival-lesson-${index}`,
        n: name,
        notes: [],
        cards: [{ id: `arrival-card-${index}`, k: 0, f: `Question about ${name}`, b: 'Answer' }],
      })),
    };
    const file = JSON.stringify({ format: 'lacuna-course', version: 1, assets: [], payload });
    const meta = JSON.stringify({
      v: 1,
      lineageId: payload.li,
      revision: 1,
      publishedAt: 1000,
      byteSize: Buffer.byteLength(file),
      courseName: payload.course.n,
    });
    await store.put(`shares/${shareId}/payload`, new TextEncoder().encode(file), {
      overwrite: true,
    });
    await store.put(`shares/${shareId}/meta`, new TextEncoder().encode(meta), { overwrite: true });
    await installShareRelay(page, handle);
    await enterFreshLacuna(page);
    await page.goto(`/#/s/${shareId}`);
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
    const add = page.getByRole('button', { name: 'Add to my courses' });
    await expect(add).toBeDisabled();
    const steady = page.getByRole('radio', { name: /Steady retention/ });
    await steady.press('Space');
    await expect(steady).toBeChecked();
    await add.press('Enter');
    await expect
      .poll(() =>
        page.evaluate(
          (id) => JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')[id],
          shareId,
        ),
      )
      .toBeTruthy();
    await page.screenshot({
      path: testInfo.outputPath(`share-import-result-${width}.png`),
      fullPage: true,
    });
    const courseId = await page.evaluate(
      (id) => JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')[id] as string,
      shareId,
    );
    await expect(page).toHaveURL(`${new URL(page.url()).origin}/#/course/${courseId}`);
    const heading = page.getByRole('heading', { name: 'Shared biology', exact: true });
    await expect(heading).toBeFocused();
    await expect(heading).toBeInViewport();
    const study = page.getByRole('button', { name: 'Study', exact: true });
    await expect(study).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`share-course-arrival-${width}.png`),
      fullPage: true,
    });
    await study.click();
    await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
  });
}

test('exports a published course connection without putting ownership secrets in the download', async ({
  page,
}, testInfo) => {
  const handle = createHandler(new MemoryStore());
  await installShareRelay(page, handle);
  await enterFreshLacuna(page);
  await createCourse(page, 'Gaps biology');
  await openShare(page, 'Gaps biology');
  const shareId = await createShareLink(page);
  const setup = page.getByRole('link', { name: 'Set up a class in Gaps', exact: true });
  await expect(setup).toHaveAttribute('href', `https://gaps.getlacuna.app/#course=${shareId}`);
  await expect(setup).toHaveAttribute('target', '_blank');
  await expect(setup).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(setup).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('share-panel-desktop.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Connect to Gaps', exact: true }).click();
  const phrase = 'several separate words for a course connection';
  await page.getByLabel(/^Connection passphrase/).fill(phrase);
  await page.getByLabel('Repeat connection passphrase', { exact: true }).fill(phrase);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download connection file' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe(`gaps-course-${shareId}.json`);
  const text = await readFile((await download.path())!, 'utf8');
  const connection = await openGapsConnection(parseGapsConnectionFile(text), phrase);
  expect(connection).toMatchObject({ shareId, courseName: 'Gaps biology', relayUrl: RELAY_URL });
  expect(text).not.toContain(connection.writeToken);
  expect(text).not.toContain(phrase);
  expect(
    (
      await handle(
        new Request(`${RELAY_URL}/shares/${shareId}`, {
          method: 'HEAD',
          headers: { Authorization: `Bearer ${connection.writeToken}` },
        }),
      )
    ).status,
  ).toBe(204);
  await expect(page.getByLabel(/^Connection passphrase/)).toHaveValue('');
  await page.screenshot({ path: testInfo.outputPath('gaps-export.png'), fullPage: true });
});

/** Serve the real relay handler from memory, so the spec exercises the wire protocol. */
async function installShareRelay(
  page: Page,
  handle: (request: Request) => Promise<Response>,
): Promise<void> {
  await page.route(`${RELAY_URL}/**`, async (route: Route) => {
    const intercepted = route.request();
    const method = intercepted.method();
    const body = intercepted.postDataBuffer() ?? undefined;
    const headers = new Headers(intercepted.headers());
    if (body && !headers.has('Content-Length')) {
      headers.set('Content-Length', String(body.byteLength));
    }
    const response = await handle(
      new Request(intercepted.url(), {
        method,
        headers,
        body: method === 'GET' || method === 'HEAD' || !body ? undefined : new Uint8Array(body),
      }),
    );
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: Buffer.from(await response.arrayBuffer()),
    });
  });
}

async function openShare(page: Page, courseName: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'More' })
    .getByRole('link', { name: 'Share', exact: true })
    .click();
  await page.getByRole('button', { name: 'Course to share' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${courseName}`) }).click();
}

async function expectShareLinkRevision(page: Page, revision: number): Promise<void> {
  const panel = page.getByRole('region', { name: 'Share link', exact: true });
  await expect(
    panel.getByRole('heading', { name: 'Share link', exact: true, level: 2 }),
  ).toBeVisible();
  await expect(panel.getByText(new RegExp(`^Revision ${revision} ·`))).toBeVisible();
}

async function createShareLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Create share link' }).click();
  await expectShareLinkRevision(page, 1);
  const url = await page.getByRole('textbox', { name: 'Share link', exact: true }).inputValue();
  const code = url.split('/').pop() ?? '';
  expect(code).toMatch(/^[0-9a-f]{32}$/);
  return code;
}

/** The student's imported copy is the only course carrying a distributed copy. */
async function readStudentRevision(page: Page): Promise<number | null> {
  return page.evaluate(
    () =>
      new Promise<number | null>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const getAll = db.transaction('courses').objectStore('courses').getAll();
          getAll.onsuccess = () => {
            db.close();
            const copy = (getAll.result as Array<{ distributedCopy?: { revision: number } }>).find(
              (course) => course.distributedCopy,
            );
            resolve(copy?.distributedCopy?.revision ?? null);
          };
          getAll.onerror = () => {
            db.close();
            reject(getAll.error);
          };
        };
      }),
  );
}

for (const linkedClass of [false, true]) {
  test(`a ${linkedClass ? 'class' : 'share'} link imports a course and follows publisher updates`, ({
    browser,
  }, testInfo) => followsPublisherUpdates(browser, testInfo, linkedClass));
}

async function followsPublisherUpdates(browser: Browser, testInfo: TestInfo, linkedClass: boolean) {
  test.setTimeout(180_000);
  // One relay store for the whole test: teacher publishes and student reads
  // the same backend, as they would in production.
  const handle = createHandler(new MemoryStore());
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await installShareRelay(teacher, handle);
  await enterFreshLacuna(teacher);
  await createCourse(teacher, 'Link biology');
  const teacherCourseId = /#\/course\/([^/]+)/.exec(teacher.url())?.[1];
  expect(teacherCourseId).toBeTruthy();

  await openShare(teacher, 'Link biology');
  const sourceCode = await createShareLink(teacher);
  let code = sourceCode;
  if (linkedClass) {
    const response = await handle(
      new Request(`${RELAY_URL}/shares`, {
        method: 'POST',
        body: JSON.stringify({ sourceShareId: sourceCode }),
      }),
    );
    expect(response.status).toBe(201);
    code = ((await response.json()) as { shareId: string }).shareId;
  }

  // Class insights opens Gaps with the published course prefilled.
  await expect(teacher.getByRole('link', { name: 'Class insights', exact: true })).toHaveAttribute(
    'href',
    `https://gaps.getlacuna.app/#course=${sourceCode}`,
  );
  await expect(teacher.getByRole('textbox', { name: 'Share link', exact: true })).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await installShareRelay(student, handle);
  await enterFreshLacuna(student);
  await student.goto(`/#/s/${code}`);
  await expect(student.getByRole('heading', { name: 'Shared course', exact: true })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await expect(student.getByText(/Link biology —/)).toBeVisible();
  await student.getByRole('radio', { name: /Exam date/ }).press('Space');
  await student.getByRole('button', { name: 'Add to my courses' }).click();
  await expect
    .poll(() =>
      student.evaluate(
        (shareId) => JSON.parse(localStorage.getItem('lacuna.shareImports') ?? '{}')[shareId],
        code,
      ),
    )
    .toBeTruthy();
  await student.goto('/#/');
  await expect(
    student
      .getByRole('navigation', { name: 'Courses' })
      .getByRole('link', { name: 'Link biology', exact: true }),
  ).toBeVisible();

  await openShare(student, 'Link biology');
  await expect(student.getByRole('textbox', { name: 'Share link', exact: true })).toHaveValue(
    `${new URL(student.url()).origin}/#/s/${code}`,
  );
  await expect(student.getByRole('button', { name: 'Create share link' })).toHaveCount(0);
  await student.screenshot({
    path: testInfo.outputPath('forward-imported-course.png'),
    fullPage: true,
  });
  await student.goto('/#/');

  // The teacher adds a card and republishes; the student's next dashboard
  // visit polls the manifest and merges the new revision.
  await addLessonCard(teacher, teacherCourseId!, 'Mitosis stages');
  await openShare(teacher, 'Link biology');
  await expectShareLinkRevision(teacher, 1);
  await teacher.getByRole('button', { name: 'Update link' }).click();
  await expectShareLinkRevision(teacher, 2);

  // Remount the dashboard past the hourly poll throttle so it picks up revision 2.
  await student.evaluate(() => localStorage.removeItem('lacuna.sharePollCheckedAt'));
  await student.reload();
  await expect(student.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect.poll(() => readStudentRevision(student)).toBe(2);
  await student
    .getByRole('navigation', { name: 'Courses' })
    .getByRole('link', { name: 'Link biology', exact: true })
    .click();
  const studentCourseId = /#\/course\/([^/]+)/.exec(student.url())?.[1];
  expect(studentCourseId).toBeTruthy();
  await student.goto(`/#/course/${studentCourseId}/cards`);
  await expect(student.getByText('Mitosis stages', { exact: true }).first()).toBeVisible();

  await student.goto(`/#/course/${studentCourseId}/settings`);
  const automaticUpdates = student.getByRole('switch', { name: 'Apply updates automatically' });
  await expect(automaticUpdates).toBeChecked();
  await automaticUpdates.scrollIntoViewIfNeeded();
  await student.screenshot({ path: testInfo.outputPath('automatic-updates-default.png') });
  await automaticUpdates.click();
  await expect(automaticUpdates).not.toBeChecked();
  await student.reload();
  await expect(automaticUpdates).not.toBeChecked();

  // After opting out, an author edit queues for review.

  await editOnlyCard(teacher, teacherCourseId!, 'Mitosis stages revised');
  await openShare(teacher, 'Link biology');
  await teacher.getByRole('button', { name: 'Update link' }).click();
  await expectShareLinkRevision(teacher, 3);

  await student.evaluate(() => localStorage.removeItem('lacuna.sharePollCheckedAt'));
  await student.goto('/#/');
  await expect(
    student
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByText('Update available', { exact: true }),
  ).toBeVisible();
  await student.goto(`/#/course/${studentCourseId}`);
  await student.getByRole('link', { name: 'Review updates' }).click();
  await student.getByRole('button', { name: 'Accept' }).first().click();
  await student.goto(`/#/course/${studentCourseId}/cards`);
  await expect(student.getByText('Mitosis stages revised', { exact: true }).first()).toBeVisible();

  await teacherContext.close();
  await studentContext.close();
}

test('stopping a share removes the link for new visitors', async ({
  browser,
}: {
  browser: Browser;
}) => {
  test.setTimeout(180_000);
  const handle = createHandler(new MemoryStore());
  const teacherContext = await browser.newContext();
  const teacher = await teacherContext.newPage();
  await installShareRelay(teacher, handle);
  await enterFreshLacuna(teacher);
  await createCourse(teacher, 'Ephemeral biology');

  await openShare(teacher, 'Ephemeral biology');
  const code = await createShareLink(teacher);
  await teacher.getByRole('button', { name: 'Stop sharing' }).click();
  await teacher
    .getByText('Stop sharing? Students keep their copies but stop receiving updates.', {
      exact: true,
    })
    .locator('..')
    .getByRole('button', { name: 'Stop sharing', exact: true })
    .click();
  await expect(teacher.getByRole('textbox', { name: 'Share link', exact: true })).toBeHidden();
  await expect(teacher.getByRole('button', { name: 'Create share link' })).toBeVisible();

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await installShareRelay(student, handle);
  await enterFreshLacuna(student);
  await student.goto(`/#/s/${code}`);
  await expect(student.getByText('This link is unavailable')).toBeVisible();

  await teacherContext.close();
  await studentContext.close();
});

test('copies an existing link without the publishing device credentials', async ({
  page,
  context,
}, testInfo) => {
  const handle = createHandler(new MemoryStore());
  await installShareRelay(page, handle);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await enterFreshLacuna(page);
  await createCourse(page, 'Biology from another device');
  await openShare(page, 'Biology from another device');
  const shareId = await createShareLink(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const opening = indexedDB.open('lacuna');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const transaction = database.transaction('appState', 'readwrite');
          const table = transaction.objectStore('appState');
          const reading = table.get('syncState');
          reading.onsuccess = () => {
            const state = reading.result as { key: string; value: { shareLinks?: unknown } };
            delete state.value.shareLinks;
            table.put(state);
          };
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
  );
  await page.reload();
  const panel = page.getByRole('region', { name: 'Share link', exact: true });
  await expect(panel.getByText(/Copy and pass on this link/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Replace link', exact: true })).toBeHidden();
  await panel.getByRole('button', { name: 'Copy', exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}/#/s/${shareId}`);
  expect((await handle(new Request(`${RELAY_URL}/shares/${shareId}/payload`))).status).toBe(200);
  await page.screenshot({
    path: testInfo.outputPath('forward-other-device-link.png'),
    fullPage: true,
  });
});

// Controlled payloads exercise the reported route; these are not the learner's Biology artefacts.
test('updates a synthetic library revision 17 through a Gaps class link at revision 22', async ({ page }) => {
  const relayUrl = 'https://relay.getlacuna.app';
  const store = new MemoryStore();
  const handle = createHandler(store);
  const minted = await handle(new Request(`${relayUrl}/shares`, { method: 'POST' }));
  const source = (await minted.json()) as { shareId: string };
  const publish = async (revision: number) => {
    const payload = { v: 2, at: 1000, li: 'controlled-library-biology', rv: revision,
      course: { n: 'Controlled biology', o: 0, c: 1000, um: 'open', sm: 1 },
      lessons: [{ i: 'source-lesson', n: 'Cells', notes: [],
        cards: [{ id: 'source-card', k: 0, f: 'What is a cell?', b: 'A living unit' }] }],
    };
    const file = JSON.stringify({ format: 'lacuna-course', version: 1, assets: [], payload });
    for (const [slot, text] of Object.entries({ payload: file, meta: JSON.stringify({
      v: 1, lineageId: payload.li, revision, publishedAt: 1000,
      byteSize: Buffer.byteLength(file), courseName: payload.course.n,
    }) })) {
      await store.put(`shares/${source.shareId}/${slot}`, new TextEncoder().encode(text), { overwrite: true });
    }
  };
  await publish(17);
  const linked = await handle(new Request(`${relayUrl}/shares`, {
    method: 'POST', body: JSON.stringify({ sourceShareId: source.shareId }),
  }));
  const gaps = (await linked.json()) as { shareId: string };
  expect(linked.status).toBe(201);
  await installShareRelay(page, handle);
  await enterFreshLacuna(page);
  await page.goto(`/#/s/${source.shareId}`);
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page.getByRole('radio', { name: /Steady retention/ }).press('Space');
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect.poll(() => readStudentRevision(page)).toBe(17);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('lacuna');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction('lineageIdMappings', 'readwrite');
      tx.objectStore('lineageIdMappings').clear();
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await publish(22);
  await page.goto(`/#/s/${gaps.shareId}`);
  await expect(page.getByRole('heading', { name: 'Course update', exact: true })).toBeVisible();
  await expect(page.getByText(/17.*22/)).toBeVisible();
  await page.getByRole('button', { name: 'Update course', exact: true }).click();
  await expect.poll(() => readStudentRevision(page)).toBe(22);
  expect(await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('lacuna');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction(['courses', 'lessons', 'cards'], 'readonly');
      const courses = tx.objectStore('courses').getAll();
      const lessons = tx.objectStore('lessons').getAll();
      const cards = tx.objectStore('cards').getAll();
      tx.oncomplete = () => {
        database.close();
        const course = courses.result.find((row) => row.distributedCopy);
        resolve({ revision: course.distributedCopy.revision,
          lessons: lessons.result.filter((row) => row.courseId === course.id).length,
          cards: cards.result.filter((row) => row.courseId === course.id).length });
      };
    };
  }))).toEqual({ revision: 22, lessons: 1, cards: 1 });
});
