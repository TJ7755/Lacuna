import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { resolvePackagedExecutable } from '../../scripts/electron-performance/executable';
import {
  closePackagedApp,
  launchPackagedApp,
} from '../../scripts/electron-performance/packaged-app';
import { waitForSeededDashboard } from '../../scripts/electron-performance/renderer-interactions';
import type { RunningPackagedApp } from '../../scripts/electron-performance/types';

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
    await page.getByRole('radio', { name: /Steady retention/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => courseStored(page, courseName)).toBe(true);
    await expect(page.getByRole('link', { name: courseName, exact: true })).toBeVisible();

    await page
      .getByRole('navigation', { name: 'Courses' })
      .getByRole('link', { name: 'Welcome to Lacuna' })
      .click();
    await page.getByRole('button', { name: 'Study', exact: true }).last().click();
    await page
      .getByRole('dialog', { name: 'Choose what to study' })
      .getByRole('button', { name: /^(Start|Continue):/ })
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
