import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

export async function chooseScheduledStudy(page: Page) {
  const sheet = page.getByRole('region', { name: 'Session preview' });
  await sheet.getByRole('button', { name: 'Start session' }).first().click();
  await expect(sheet).toBeHidden();
}

export async function enterFreshLacuna(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await skipOnboarding(page);
}

/** A fresh install starts with onboarding; Exit leaves it for an empty Today. */
export async function skipOnboarding(page: Page) {
  await expect(page).toHaveURL(/#\/start$/);
  await page.getByRole('button', { name: 'Exit' }).click();
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** Exercises Today import on desktop and the navigation-drawer entry on phones. */
export async function openImport(page: Page) {
  // Packaged Electron has no emulated viewport, so read the window's own width there.
  const width = page.viewportSize()?.width ?? (await page.evaluate(() => window.innerWidth));
  if (width >= 640) {
    await page.locator('main').getByRole('button', { name: 'Import', exact: true }).click();
  } else {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('dialog', { name: 'Navigation' })
      .getByRole('link', { name: 'Import' })
      .click();
  }
}

const WELCOME_COURSE = readFileSync(new URL('./welcome-course.lacuna', import.meta.url), 'utf8');
const DAY_MS = 86_400_000;

/** Imports the retired Welcome to Lacuna course, which many specs use as a populated course. */
export async function importWelcomeCourse(page: Page) {
  const file = JSON.parse(WELCOME_COURSE);
  file.payload.at = Date.now();
  file.payload.course.c = Date.now();
  file.payload.course.e = Date.now() + 60 * DAY_MS;
  for (const exam of file.payload.exams) exam.e = file.payload.course.e;
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Welcome to Lacuna.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  const examDate = page.getByRole('radio', { name: /Exam date/ });
  await examDate.locator('..').click();
  await expect(examDate).toBeChecked();
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  // Let the import's toast expire so it cannot cover or stack with the spec's own. Hovering
  // pauses it, and the pointer is still where the Add button was.
  await page.mouse.move(0, 0);
  await expect(page.getByText(/^Added 1 course and \d+ cards\.$/)).toBeHidden({ timeout: 10_000 });
  // Set the hash rather than navigating, so packaged Electron's app: origin works too.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

/** A fresh browser holding only the Welcome to Lacuna course, as new installs once had. */
export async function enterWithWelcomeCourse(page: Page) {
  await enterFreshLacuna(page);
  await importWelcomeCourse(page);
}

/** Creates a course, then selects its first lesson for authoring unless the caller needs the ladder. */
export async function createCourse(page: Page, courseName: string, openLesson = true) {
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  const form = page.getByRole('form', { name: 'New course' });
  await form.getByRole('textbox', { name: 'Course name' }).fill(courseName);
  const steadyRetention = form.getByRole('radio', { name: /Steady retention/ });
  await steadyRetention.focus();
  await steadyRetention.press('Space');
  await expect(steadyRetention).toBeChecked();
  await form.getByRole('button', { name: 'Create', exact: true }).click();

  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Courses' })
      .getByRole('link', { name: courseName, exact: true }),
  ).toBeVisible();
  const courseUrl = page.url();
  await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
  if (openLesson) {
    await page.getByRole('button', { name: 'Lesson 1', exact: true }).click();
    await expect(page).toHaveURL(/#\/course\/[^/]+\/lesson\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
  }
  return courseUrl;
}

/** Gives the open lesson a note, so a new course has something to study. */
export async function addLessonNote(page: Page, title: string) {
  await page.getByRole('button', { name: 'Add note' }).click();
  const field = page.getByRole('textbox', { name: 'Title' });
  await field.fill(title);
  await field.press('Control+Enter');
  await expect(field).toBeHidden();
}
