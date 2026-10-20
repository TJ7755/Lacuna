import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { DAY_MS, completedIsoDayLabel } from '../../relay/src/insightsDay';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { parseClassCode } from '../../src/insights/classCode';
import { addLessonCard, reviewOnlyCard, readAll } from './fixtures/syncConvergence';

test.skip(
  process.env.VITE_GAPS_REPORTING_ENABLED !== 'true' || process.env.LACUNA_BROWSER_SITE === 'gaps',
  'Requires the isolated trial-enabled learner build',
);
test.use({ actionTimeout: 15_000 });
let teacherBuild: string;
test.beforeAll(async () => {
  teacherBuild = await mkdtemp(join(tmpdir(), 'gaps-daily-flow-'));
  execFileSync('bun', ['run', 'build:gaps:assets', '--outDir', teacherBuild, '--emptyOutDir'], {
    stdio: 'pipe',
  });
});
test.afterAll(async () => {
  if (teacherBuild) await rm(teacherBuild, { recursive: true, force: true });
});

test('relays a consenting pupil’s study evidence into the separate teacher workspace', async ({
  page: author,
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  process.env.RELAY_INSIGHTS_ENABLED = '1';
  const clock = Date.now(),
    day = completedIsoDayLabel(clock);
  const relay = new MemoryStore(() => clock),
    handle = createHandler(relay, { now: () => clock });
  const uploads: string[] = [];
  async function wire(page: Page) {
    await page.route('https://relay.getlacuna.app/**', async (route) => {
      const source = route.request(),
        method = source.method(),
        body = source.postDataBuffer();
      const headers = new Headers(source.headers());
      if (body) headers.set('Content-Length', String(body.length));
      if (source.url().includes('/insights/') && method === 'PUT') uploads.push(body!.toString());
      const response = await handle(
        new Request(source.url(), {
          method,
          headers,
          body: method === 'GET' || method === 'HEAD' || !body ? undefined : new Uint8Array(body),
        }),
      );
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      });
    });
  }
  await wire(author);
  await enterFreshLacuna(author);
  await createCourse(author, 'Class biology');
  const courseId = /#\/course\/([^/]+)/.exec(author.url())![1];
  await addLessonCard(author, courseId, 'Membrane recall');
  await author.goto('/#/share');
  await author.getByRole('button', { name: 'Course to share' }).click();
  await author.getByRole('menuitem', { name: /^Class biology/ }).click();
  await author.getByRole('button', { name: 'Create share link' }).click();
  await expect(author.getByRole('textbox', { name: 'Share link', exact: true })).toBeVisible();
  const sourceLink = await author
    .getByRole('textbox', { name: 'Share link', exact: true })
    .inputValue();
  const sourceShareId = sourceLink.split('/').pop()!;

  const teacherContext = await browser.newContext(),
    pupilContext = await browser.newContext(),
    returningContext = await browser.newContext();
  try {
    const teacher = await teacherContext.newPage(),
      pupil = await pupilContext.newPage();
    await wire(teacher);
    await wire(pupil);
    // A second production build on its own origin, with no learner bundle or database.
    await teacher.emulateMedia({ reducedMotion: 'reduce' });
    await teacher.route('https://gaps.getlacuna.app/**', async (route) => {
      const path = decodeURIComponent(new URL(route.request().url()).pathname);
      const file = resolve(teacherBuild, path === '/' ? 'index.html' : `.${path}`);
      if (!file.startsWith(`${teacherBuild}/`)) return route.abort();
      const type = file.endsWith('.js')
        ? 'text/javascript'
        : file.endsWith('.css')
          ? 'text/css'
          : file.endsWith('.html')
            ? 'text/html'
            : 'application/octet-stream';
      await route.fulfill({ body: await readFile(file), contentType: type });
    });
    await teacher.goto('https://gaps.getlacuna.app/');
    await teacher.getByLabel('Course link or code').fill(sourceLink);
    await teacher.getByRole('checkbox', { name: 'Remember this class on this device' }).uncheck();
    await teacher.getByRole('button', { name: 'Create class', exact: true }).click();
    await expect(teacher.getByRole('heading', { name: 'Class created' })).toBeFocused();
    const recoveryCode = (await teacher.getByLabel('Recovery code').innerText()).replace(/\s/g, '');
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('class-protected.png'),
      fullPage: true,
    });
    const recoveryDownload = teacher.waitForEvent('download');
    await teacher
      .getByRole('button', { name: 'Download class recovery file', exact: true })
      .click();
    await recoveryDownload;
    await teacher.getByRole('button', { name: 'Continue to class' }).click();
    await expect(teacher.getByText(/No report does not mean no study/)).toBeVisible();
    await teacher.getByRole('button', { name: 'Lock', exact: true }).click();
    const unlock = teacher.getByRole('form', { name: 'Unlock class' });
    await expect(unlock.getByLabel('Recovery code', { exact: true })).toBeVisible();
    await expect(teacher.getByRole('heading', { name: 'Class biology', level: 1 })).toBeAttached();
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('unlock-class.png'),
      fullPage: true,
    });
    await unlock.getByLabel('Recovery code', { exact: true }).fill(recoveryCode);
    await unlock.getByRole('checkbox', { name: 'Remember this class on this device' }).uncheck();
    await unlock.getByRole('button', { name: 'Unlock class', exact: true }).click();
    // Unlocking reads the latest completed day; an empty day does not claim no study.
    await expect(teacher.getByText(/No report does not mean no study/)).toBeVisible();
    await expect(teacher.getByRole('table')).toHaveCount(0);
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('empty-results-desktop.png'),
      fullPage: true,
    });
    await teacher.setViewportSize({ width: 390, height: 844 });
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('empty-results-mobile.png'),
      fullPage: true,
    });
    await teacher.setViewportSize({ width: 1280, height: 900 });
    await teacher.getByRole('button', { name: 'Share class code', exact: true }).click();
    await teacher.getByRole('button', { name: 'Publish class code', exact: true }).click();
    await expect(teacher.getByLabel('Class code', { exact: true })).toHaveValue(
      /^[0-9A-Z]{4}-[0-9A-Z]{4}$/,
    );
    await expect(teacher.getByRole('button', { name: 'Copy code', exact: true })).toBeVisible();
    await expect(
      teacher.getByText(/Pupils open getlacuna.app, choose Join a class on Today/),
    ).toBeVisible();
    const code = await teacher.getByLabel('Class code', { exact: true }).inputValue();
    expect(code).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{4}$/);
    const link = await teacher.getByLabel('Pupil join link', { exact: true }).inputValue();
    const { shareId } = parseClassCode(link);
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('invitation-desktop.png'),
      fullPage: true,
    });
    await teacher.setViewportSize({ width: 390, height: 844 });
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('invitation-mobile.png'),
      fullPage: true,
    });
    await teacher.setViewportSize({ width: 1280, height: 900 });
    expect(shareId).not.toBe(sourceShareId);
    expect(await relay.get(`shares/${sourceShareId}/teacher`)).toBeNull();
    expect(await relay.get(`shares/${shareId}/teacher`)).not.toBeNull();
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('share-class-code.png'),
      fullPage: true,
    });

    await pupil.clock.setFixedTime(clock - DAY_MS);
    await enterFreshLacuna(pupil);
    await pupil.getByRole('link', { name: 'Join a class', exact: true }).click();
    await pupil
      .getByLabel('Class code', { exact: true })
      .fill(` ${code.toLowerCase().replace('-', ' - ')} `);
    await pupil.getByRole('button', { name: 'Join class', exact: true }).click();
    await pupil.getByRole('button', { name: 'Add to my courses' }).click();
    const consent = pupil.getByRole('switch', { name: 'Share insights with your teacher' });
    await expect(consent).toHaveAttribute('aria-checked', 'false');
    await expect(pupil.getByRole('link', { name: 'School data notice' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md',
    );
    expect(uploads).toHaveLength(0);
    // A returning pupil first imports the original course, then joins using only the board code.
    const returning = await returningContext.newPage();
    await wire(returning);
    await enterFreshLacuna(returning);
    await returning.goto(`/#/s/${sourceShareId}`);
    await returning.getByRole('button', { name: 'Add to my courses' }).click();
    await expect(returning.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
    const beforeCourses = await readAll<{ id: string; distributedCopy?: unknown }>(
      returning,
      'courses',
    );
    const existingCourse = beforeCourses.find((course) => course.distributedCopy)!;
    await reviewOnlyCard(returning, existingCourse.id);
    const beforeCards = await readAll(returning, 'cards');
    const beforeHistory = await readAll(returning, 'reviewHistory');
    await returning.goto('/#/');
    await returning.getByRole('link', { name: 'Join a class', exact: true }).click();
    await returning.getByLabel('Class code', { exact: true }).fill(code);
    await returning.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(
      returning.getByRole('switch', { name: 'Share insights with your teacher' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      (await readAll<{ id: string }>(returning, 'courses')).map((course) => course.id),
    ).toEqual(beforeCourses.map((course) => course.id));
    expect(await readAll(returning, 'cards')).toEqual(beforeCards);
    expect(await readAll(returning, 'reviewHistory')).toEqual(beforeHistory);
    expect(
      await returning.evaluate(
        (id) => JSON.parse(localStorage.getItem('lacuna.shareImports')!)[id],
        shareId,
      ),
    ).toBe(existingCourse.id);
    expect(uploads).toHaveLength(0);

    await pupil.getByLabel(/^Name or class identifier/).fill('Pupil A');
    await consent.click();
    await expect(consent).toHaveAttribute('aria-checked', 'true');
    const importedId = await pupil.evaluate(
      (id) => JSON.parse(localStorage.getItem('lacuna.shareImports')!)[id] as string,
      shareId,
    );
    await reviewOnlyCard(pupil, importedId);
    expect(uploads).toHaveLength(0);
    await pupil.clock.setFixedTime(clock);
    await pupil.goto(`/#/s/${code}`);
    await pupil.reload();
    await expect(pupil.getByText(`Last sent: ${day}.`, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    expect(uploads).toHaveLength(1);
    expect(await relay.list(`insights/${sourceShareId}/`)).toEqual([]);
    expect((await relay.list(`insights/${shareId}/`)).length).toBeGreaterThan(0);
    expect(uploads[0]).not.toContain('Pupil A');
    expect(uploads[0]).not.toContain('Membrane');
    await pupil.screenshot({ path: testInfo.outputPath('pupil-consent.png'), fullPage: true });
    await teacher.getByRole('tab', { name: 'Results', exact: true }).click();
    await teacher.getByRole('button', { name: 'Read again', exact: true }).click();
    await expect(teacher.getByRole('table')).toBeVisible();
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('class-results-desktop.png'),
      fullPage: true,
    });
    await teacher.getByRole('button', { name: 'Toggle colour theme' }).click();
    await expect(teacher.locator('html')).not.toHaveClass(/dark/);
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('class-results-light-desktop.png'),
      fullPage: true,
    });
    await teacher.getByRole('button', { name: 'Toggle colour theme' }).click();
    await teacher.getByRole('button', { name: 'Toggle colour theme' }).click();
    await expect(teacher.locator('html')).toHaveClass(/dark/);
    const answerCell = teacher.getByRole('table').locator('tbody td button').first();
    for (const target of [teacher.getByRole('button', { name: 'Previous day' }), answerCell]) {
      const hitArea = await target.evaluate((element) => {
        const before = getComputedStyle(element, '::before');
        return { width: Number.parseFloat(before.width), height: Number.parseFloat(before.height) };
      });
      expect(hitArea.width).toBeGreaterThanOrEqual(44);
      expect(hitArea.height).toBeGreaterThanOrEqual(44);
    }
    await answerCell.focus();
    await expect(answerCell).toBeFocused();
    await answerCell.press('Enter');
    await expect(teacher.getByRole('region', { name: 'Evidence for Pupil A' })).toContainText(
      'Recalled',
    );
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('daily-report-desktop.png'),
      fullPage: true,
    });
    await teacher.setViewportSize({ width: 390, height: 844 });
    expect(await teacher.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('daily-report-mobile.png'),
      fullPage: true,
    });
    expect(
      (await teacher.evaluate(() => indexedDB.databases())).map((db) => db.name).sort(),
    ).toEqual(['lacuna.gaps.connections', 'lacuna.gaps.owner-keys']);
    await teacher.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(teacher.getByRole('heading', { name: 'Unlock to see results' })).toBeVisible();
    await expect(teacher.getByRole('table')).toHaveCount(0);
    await consent.click();
    await expect(consent).toHaveAttribute('aria-checked', 'false');
    await pupil.reload();
    await expect(pupil.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    expect(uploads).toHaveLength(1);
  } finally {
    await Promise.allSettled([
      teacherContext.close(),
      pupilContext.close(),
      returningContext.close(),
    ]);
    delete process.env.RELAY_INSIGHTS_ENABLED;
  }
});
