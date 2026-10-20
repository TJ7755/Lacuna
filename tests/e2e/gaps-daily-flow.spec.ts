import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, test, type Page } from '@playwright/test';
import { createHandler } from '../../relay/src/relay';
import { MemoryStore } from '../../relay/src/store';
import { DAY_MS, completedIsoDayLabel } from '../../relay/src/insightsDay';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';
import { addLessonCard, reviewOnlyCard } from './fixtures/syncConvergence';

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
    day = completedIsoDayLabel(clock),
    phrase = 'several separate words for the school trial';
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
  await author.getByRole('button', { name: 'Connect to Gaps', exact: true }).click();
  await author.getByLabel(/^Connection passphrase/).fill(phrase);
  await author.getByLabel('Repeat connection passphrase', { exact: true }).fill(phrase);
  const downloading = author.waitForEvent('download');
  await author.getByRole('button', { name: 'Download connection file' }).click();
  const download = await downloading,
    connectionFile = await readFile((await download.path())!);
  const shareId = JSON.parse(connectionFile.toString()).shareId as string;

  const teacherContext = await browser.newContext(),
    pupilContext = await browser.newContext();
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
    await teacher.getByLabel('Connection file').setInputFiles({
      name: 'gaps-course.json',
      mimeType: 'application/json',
      buffer: connectionFile,
    });
    await teacher.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await teacher.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(teacher.getByRole('heading', { name: 'Protect this class' })).toBeVisible();
    await teacher.getByLabel(/^Recovery passphrase/).fill(phrase);
    await teacher.getByLabel('Repeat recovery passphrase').fill(phrase);
    await teacher.getByRole('button', { name: 'Protect class reports', exact: true }).click();
    await expect(
      teacher.getByText('Class protected. Download its recovery file.', { exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('class-protected.png'),
      fullPage: true,
    });
    const recoveryDownload = teacher.waitForEvent('download');
    await teacher.getByRole('button', { name: 'Download encrypted recovery file' }).click();
    await recoveryDownload;
    await teacher.getByRole('button', { name: 'Continue to class' }).click();
    const unlock = teacher.getByRole('form', { name: 'Unlock class' });
    await expect(unlock.getByLabel('Connection passphrase', { exact: true })).toBeFocused();
    await expect(teacher.getByRole('heading', { name: 'Class biology', level: 1 })).toBeAttached();
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('unlock-class.png'),
      fullPage: true,
    });
    await unlock.getByLabel('Connection passphrase', { exact: true }).fill(phrase);
    await unlock.getByLabel('Recovery passphrase', { exact: true }).fill(phrase);
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
    const code = await teacher.getByLabel('Class code', { exact: true }).inputValue();
    expect(code).toMatch(/^GAPS1_[A-Za-z0-9_-]{64}$/);
    expect(await relay.get(`shares/${shareId}/teacher`)).not.toBeNull();
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('share-class-code.png'),
      fullPage: true,
    });

    await pupil.clock.setFixedTime(clock - DAY_MS);
    await enterFreshLacuna(pupil);
    await pupil.goto('/#/import');
    await pupil.getByRole('button', { name: /Lacuna course/ }).click();
    await pupil.getByLabel('Share link or code to import').fill(code);
    await pupil.getByRole('button', { name: 'Read code' }).click();
    await pupil.getByRole('button', { name: 'Add to my courses' }).click();
    const consent = pupil.getByRole('switch', { name: 'Share insights with your teacher' });
    await expect(consent).toHaveAttribute('aria-checked', 'false');
    await expect(pupil.getByRole('link', { name: 'School data notice' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna/blob/master/docs/gaps-school-notice.md',
    );
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
    await teacher.screenshot({
      animations: 'disabled',
      path: testInfo.outputPath('class-results-light-desktop.png'),
      fullPage: true,
    });
    await teacher.getByRole('button', { name: 'Toggle colour theme' }).click();
    const answerCell = teacher.getByRole('table').locator('tbody td button').first();
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
    await Promise.allSettled([teacherContext.close(), pupilContext.close()]);
    delete process.env.RELAY_INSIGHTS_ENABLED;
  }
});
