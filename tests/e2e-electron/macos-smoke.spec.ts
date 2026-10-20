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
import { landingFilms } from '../../src/components/landing/films';

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
    await page.locator('main').getByRole('button', { name: 'New course' }).click();
    await page.getByRole('textbox', { name: 'Course name' }).fill(courseName);
    const steady = page.getByRole('radio', { name: /Steady retention/ });
    await steady.focus();
    await steady.press('Space');
    await expect(steady).toBeChecked();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await expect(
      page
        .getByRole('navigation', { name: 'Courses' })
        .getByRole('link', { name: courseName, exact: true }),
    ).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Courses' })
      .getByRole('link', { name: 'Welcome to Lacuna' })
      .click();
    await page.getByRole('button', { name: 'Study', exact: true }).last().click();
    await page
      .getByRole('region', { name: 'Session preview' })
      .getByRole('button', { name: 'Start session' })
      .first()
      .click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    const cardId = await page
      .locator('[data-study-card-id]')
      .first()
      .getAttribute('data-study-card-id');
    expect(cardId).toBeTruthy();
    await page
      .getByRole('button', { name: /Show answer/i })
      .last()
      .click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Session progress' })).toContainText(
      'Card 2 of',
    );
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Leave this session?' })
      .getByRole('button', { name: 'Leave' })
      .click();
    await expect(page.getByRole('button', { name: 'Study', exact: true }).last()).toBeVisible();
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

    const exit = await closePackagedApp(running);
    running = undefined;
    expect(exit.exitCode).toBe(0);
  } finally {
    try {
      if (running) await closePackagedApp(running);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('macOS packaged landing films hand off to the external browser', async () => {
  test.skip(process.platform !== 'darwin', 'This smoke gate runs on macOS.');
  const executablePath = await resolvePackagedExecutable({
    appDir: process.env.LACUNA_ELECTRON_APP_DIR,
  });
  const profile = await realpath(await mkdtemp(path.join(tmpdir(), 'lacuna-film-handoff-')));
  const app = await electron.launch({ executablePath, args: [`--user-data-dir=${profile}`] });
  try {
    expect(await app.evaluate(({ app }) => app.isPackaged)).toBe(true);
    await app.evaluate(({ shell }) => {
      const urls: string[] = [];
      (globalThis as typeof globalThis & { filmUrls: string[] }).filmUrls = urls;
      // Capture the operating-system hand-off after the real window security handler.
      shell.openExternal = async (url) => {
        urls.push(url);
      };
    });
    const page = await app.firstWindow();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForLoadState('domcontentloaded');
    expect(new URL(page.url()).protocol).toBe('app:');
    await page.evaluate(() => {
      window.location.hash = '/landing';
    });
    for (const film of Object.values(landingFilms)) {
      await page.getByRole('button', { name: `Watch ${film.title}, ${film.duration}` }).click();
    }
    await expect
      .poll(() =>
        app.evaluate(() => (globalThis as typeof globalThis & { filmUrls: string[] }).filmUrls),
      )
      .toEqual(Object.values(landingFilms).map((film) => film.externalSrc));
    await expect(page.locator('video')).toHaveCount(0);
    expect(app.windows()).toHaveLength(1);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
