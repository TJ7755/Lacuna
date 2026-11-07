import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';
import {
  closePackagedApp,
  launchPackagedApp,
} from '../../scripts/electron-performance/packaged-app';
import { waitForSeededDashboard } from '../../scripts/electron-performance/renderer-interactions';
import type { RunningPackagedApp } from '../../scripts/electron-performance/types';
import { landingFilms } from '../../apps/web/src/components/landing/films';
import { chooseScheduledStudy, completeRevealedIntroduction } from '../e2e/fixtures/lacunaApp';

async function courseStored(page: Page, courseName: string): Promise<boolean> {
  return page.evaluate(
    (name) =>
      new Promise<boolean>((resolve, reject) => {
        const request = indexedDB.open('lacuna');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const courses = database.transaction('courses').objectStore('courses').getAll();
          courses.onsuccess = () => {
            database.close();
            resolve(courses.result.some((course) => course.name === name));
          };
          courses.onerror = () => {
            database.close();
            reject(courses.error);
          };
        };
      }),
    courseName,
  );
}

test('macOS packaged Electron launches, stores a course and completes a study step', async ({
  browserName: _browserName,
}, testInfo) => {
  test.skip(process.platform !== 'darwin', 'This smoke gate runs on macOS.');

  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-macos-smoke-')));
  let running: RunningPackagedApp | undefined;
  try {
    running = await launchPackagedApp(executablePath, path.join(root, 'profile'));
    expect(running.packaged).toBe(true);
    expect(running.rendererProtocol).toBe('app:');
    expect(running.viteResourceCount).toBe(0);

    const page = running.page;
    await waitForSeededDashboard(page);
    const courseName = 'macOS storage smoke';
    const front = 'Which tissue carries water?';
    const back = 'Xylem';
    const lesson = page
      .getByRole('list', { name: 'Course path' })
      .getByRole('button', { name: 'Lesson 1', exact: true });
    await page.locator('main').getByRole('button', { name: 'New course' }).click();
    await page.getByRole('textbox', { name: 'Course name' }).fill(courseName);
    const steady = page.getByRole('radio', { name: /Steady retention/ });
    await steady.focus();
    await steady.press('Space');
    await expect(steady).toBeChecked();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(lesson).toBeVisible();
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await expect(
      page
        .getByRole('navigation', { name: 'Courses' })
        .getByRole('link', { name: courseName, exact: true }),
    ).toBeVisible();

    await lesson.click();
    await page.getByRole('button', { name: 'Edit mode' }).click();
    await page.getByRole('button', { name: 'New card', exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Front' }).fill(front);
    await page.getByRole('textbox', { name: 'Back' }).fill(back);
    await page.getByRole('button', { name: 'Add card', exact: true }).click();
    await expect(page.getByText(front, { exact: true }).first()).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Course sections' })
      .getByRole('link', { name: 'Path', exact: true })
      .click();
    const study = page.getByRole('button', { name: 'Study', exact: true }).last();
    await study.click();
    await chooseScheduledStudy(page);
    const cardId = await page
      .locator('[data-study-card-id]')
      .first()
      .getAttribute('data-study-card-id');
    expect(cardId).toBeTruthy();
    await completeRevealedIntroduction(page, back);
    const progress = page.getByRole('main', { name: 'Study progress' });
    await expect(progress.getByRole('img', { name: 'Completed', exact: true })).toBeVisible();
    await progress.getByRole('button', { name: 'Finish for now', exact: true }).click();
    await expect(study).toBeVisible();
    await testInfo.attach('macos-study-smoke.json', {
      body: Buffer.from(
        JSON.stringify(
          {
            executablePath,
            appVersion: running.appVersion,
            rendererUrl: running.rendererUrl,
            storedCourse: courseName,
            cardId,
          },
          null,
          2,
        ),
      ),
      contentType: 'application/json',
    });

    const closing = running;
    running = undefined;
    const exit = await closePackagedApp(closing);
    expect(exit.exitCode).toBe(0);
  } catch (error) {
    if (running) {
      try {
        await closePackagedApp(running);
      } catch (shutdownError) {
        await testInfo.attach('packaged-cleanup-error.txt', {
          body: String(shutdownError),
          contentType: 'text/plain',
        });
      }
    }
    throw error;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('macOS packaged landing previews load as local images', async () => {
  test.skip(process.platform !== 'darwin', 'This smoke gate runs on macOS.');
  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-landing-previews-')));
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForLoadState('domcontentloaded');
    expect(new URL(page.url()).protocol).toBe('app:');
    await page.evaluate(() => {
      window.location.hash = '/landing';
    });
    for (const film of Object.values(landingFilms)) {
      const preview = page.getByRole('img', { name: film.description });
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toBeVisible();
      await expect
        .poll(() => preview.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    }
    await expect(page.locator('.landing-film video')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Watch/ })).toHaveCount(0);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
