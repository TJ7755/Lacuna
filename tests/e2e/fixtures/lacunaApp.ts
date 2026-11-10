import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Route } from '@playwright/test';
import type * as WelcomeCourseSeed from './welcomeCourseSeed';

export async function chooseScheduledStudy(page: Page) {
  const sheet = page.getByRole('region', { name: 'Session preview' });
  await sheet.getByRole('button', { name: 'Start session' }).first().click();
  await expect(sheet).toBeHidden();
}

export async function chooseRecallPractice(page: Page, lessonName?: string) {
  const sheet = page.getByRole('region', { name: 'Session preview' });
  await sheet.getByRole('button', { name: 'Other ways', exact: true }).click();
  await sheet.getByText('Practise until all correct', { exact: true }).click();
  if (lessonName) await sheet.getByLabel('What to practise').selectOption({ label: lessonName });
  await sheet.getByRole('button', { name: 'Start practising', exact: true }).click();
  await expect(sheet).toBeHidden();
}

export async function completeRevealedIntroduction(page: Page, answer: string) {
  const study = page.getByRole('main', { name: 'Study card' });
  const next = study.getByRole('button', { name: 'Continue', exact: true });
  await study.getByRole('button', { name: 'Show answer', exact: true }).last().click();
  await next.click();
  await study.getByRole('textbox', { name: 'Your answer' }).fill(answer);
  await study.getByRole('button', { name: 'Check answer', exact: true }).click();
  await next.click();
  await page
    .getByRole('main', { name: 'Session report' })
    .getByRole('button', { name: 'Continue', exact: true })
    .click();
}

export async function continueStudyReportByKeyboard(page: Page) {
  const next = page
    .getByRole('main', { name: 'Session report' })
    .getByRole('button', { name: 'Continue', exact: true });
  await expect(next).toBeVisible();
  for (
    let tabs = 0;
    tabs < 8 && !(await next.evaluate((button) => button === document.activeElement));
    tabs += 1
  ) {
    await page.keyboard.press('Tab');
  }
  await expect(next).toBeFocused();
  await page.keyboard.press('Enter');
}

export async function enterFreshLacuna(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await skipOnboarding(page);
}

/** Start with the preferences of a fresh learner who already exited onboarding. */
export async function openEmptyDashboard(page: Page) {
  // This fixture also loads in the Node-only installed Windows probe.
  await page.addInitScript(() => {
    if (window !== window.top || location.hash !== '#/' || localStorage.getItem('lacuna-seeded'))
      return;
    localStorage.setItem('lacuna-seeded', '1');
    localStorage.setItem('lacuna-seed-assets-v3', '1');
    localStorage.setItem('lacuna-onboarding', 'done');
    if (localStorage.getItem('lacuna.advancedDetails') === null)
      localStorage.setItem('lacuna.advancedDetails', 'false');
  });
  await page.goto('/#/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
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

function welcomeCourseFile() {
  const file = JSON.parse(WELCOME_COURSE);
  file.payload.at = Date.now();
  file.payload.course.c = Date.now();
  const examDate = Date.now() + 60 * DAY_MS;
  file.payload.course.e = examDate;
  for (const exam of file.payload.exams) exam.e = examDate;
  return { text: JSON.stringify(file), examDate };
}

/** Imports the retired Welcome to Lacuna course through the file picker. */
export async function importWelcomeCourse(page: Page, { restart = false } = {}) {
  const { text } = welcomeCourseFile();
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Welcome to Lacuna.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  const examDate = page.getByRole('radio', { name: /Exam date/ });
  await examDate.locator('..').click();
  await expect(examDate).toBeChecked();
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeHidden();
  const added = page.getByText(/^Added 1 course and \d+ cards\.$/);
  await expect(added).toBeVisible();
  if (!restart) {
    // Hovering pauses the toast. Keep the same app session for specs that import mid-flow.
    await page.mouse.move(0, 0);
    await expect(added).toBeHidden({ timeout: 10_000 });
  }
  // Set the hash rather than navigating, so packaged Electron's app: origin works too.
  await page.evaluate(() => {
    window.location.hash = '#/';
  });
  if (restart) {
    // The success toast follows the database commit. Reload to clear transient UI state.
    await page.reload();
  }
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More for Welcome to Lacuna' })).toBeVisible();
}

let welcomeCourseBundle: Promise<string> | undefined;

/** Open Today on a fresh browser holding the retired Welcome to Lacuna course. */
export async function enterWithWelcomeCourse(page: Page) {
  if (page.url() !== 'about:blank') throw new Error('Welcome course setup needs a fresh page.');
  welcomeCourseBundle ??= import('esbuild').then(async ({ build }) => {
    const bundle = await build({
      entryPoints: [fileURLToPath(new URL('./welcomeCourseSeed.ts', import.meta.url))],
      bundle: true,
      write: false,
      platform: 'browser',
      format: 'esm',
      define: { 'import.meta.env.DEV': 'false' },
    });
    return bundle.outputFiles[0].text;
  });
  const script = await welcomeCourseBundle;
  const bootstrapPath = '/__lacuna_welcome_fixture';
  const modulePath = `${bootstrapPath}.js`;
  const fixtureRequests = /\/__lacuna_welcome_fixture(?:\.js)?$/;
  const serveFixture = (route: Route) =>
    new URL(route.request().url()).pathname === modulePath
      ? route.fulfill({ contentType: 'text/javascript', body: script })
      : route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Welcome fixture</title>',
        });

  // Seed on the app's origin before loading any of its real route chunks.
  await page.route(fixtureRequests, serveFixture);
  try {
    await page.goto(bootstrapPath);
    await page.evaluate(
      async ({ modulePath, text, examDate }) => {
        const fixture: typeof WelcomeCourseSeed = await import(modulePath);
        await fixture.seed(text, examDate);
      },
      { modulePath, ...welcomeCourseFile() },
    );
  } finally {
    await page.unroute(fixtureRequests, serveFixture);
  }
  await openEmptyDashboard(page);
  await expect(page.getByRole('button', { name: 'More for Welcome to Lacuna' })).toBeVisible();
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
