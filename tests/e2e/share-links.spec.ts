import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import { createHandler } from '../../relay/src/relay.js';
import { MemoryStore } from '../../relay/src/store.js';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { addLessonCard, editOnlyCard } from './fixtures/syncConvergence';

const RELAY_URL = 'https://lacuna-relay.vercel.app';

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
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Share', exact: true })
    .click();
  await page.getByRole('button', { name: new RegExp(courseName) }).click();
}

async function createShareLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Create share link' }).click();
  await expect(page.getByText('Share link · revision 1')).toBeVisible();
  const url = await page.getByLabel('Share link').inputValue();
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

test('a share link imports a course and republishes update it', async ({ browser }: { browser: Browser }) => {
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
  const code = await createShareLink(teacher);

  const studentContext = await browser.newContext();
  const student = await studentContext.newPage();
  await installShareRelay(student, handle);
  await enterFreshLacuna(student);
  await student.goto(`/#/s/${code}`);
  await expect(student.getByRole('heading', { name: 'Shared course', exact: true })).toBeVisible();
  await expect(student.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await expect(student.getByText(/Link biology —/)).toBeVisible();
  await student.getByRole('button', { name: 'Add to my courses' }).click();
  await student.goto('/#/');
  await expect(student.getByRole('link', { name: 'Link biology', exact: true })).toBeVisible();

  // The teacher adds a card and republishes; the student's next dashboard
  // visit polls the manifest and merges the new revision.
  await addLessonCard(teacher, teacherCourseId!, 'Mitosis stages');
  await openShare(teacher, 'Link biology');
  await expect(teacher.getByText('Share link · revision 1')).toBeVisible();
  await teacher.getByRole('button', { name: /Republish link/ }).click();
  await expect(teacher.getByText('Share link · revision 2')).toBeVisible();

  // Remount the dashboard past the hourly poll throttle so it picks up revision 2.
  await student.evaluate(() => localStorage.removeItem('lacuna.sharePollCheckedAt'));
  await student.reload();
  await expect(student.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await expect.poll(() => readStudentRevision(student)).toBe(2);
  await student.getByRole('link', { name: 'Link biology', exact: true }).click();
  const studentCourseId = /#\/course\/([^/]+)/.exec(student.url())?.[1];
  expect(studentCourseId).toBeTruthy();
  await student.goto(`/#/course/${studentCourseId}/cards`);
  await expect(student.getByText('Mitosis stages', { exact: true }).first()).toBeVisible();

  // An edited card queues behind the "Update available" badge instead of
  // applying silently; accepting it in review updates the student copy.
  await editOnlyCard(teacher, teacherCourseId!, 'Mitosis stages revised');
  await openShare(teacher, 'Link biology');
  await teacher.getByRole('button', { name: /Republish link/ }).click();
  await expect(teacher.getByText('Share link · revision 3')).toBeVisible();

  await student.evaluate(() => localStorage.removeItem('lacuna.sharePollCheckedAt'));
  await student.goto('/#/');
  // The flip card renders the badge on both faces while the back face stays
  // aria-hidden, so target the visible instance explicitly.
  await expect(student.locator('span:text-is("Update available"):visible')).toBeVisible();
  await student.goto(`/#/course/${studentCourseId}`);
  await student.getByRole('link', { name: 'Review updates' }).click();
  await student.getByRole('button', { name: 'Accept' }).first().click();
  await student.goto(`/#/course/${studentCourseId}/cards`);
  await expect(student.getByText('Mitosis stages revised', { exact: true }).first()).toBeVisible();

  await teacherContext.close();
  await studentContext.close();
});

test('stopping a share removes the link for new visitors', async ({ browser }: { browser: Browser }) => {
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
  await teacher.getByRole('button', { name: 'Yes, stop sharing' }).click();
  await expect(teacher.getByLabel('Share link')).toBeHidden();
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
