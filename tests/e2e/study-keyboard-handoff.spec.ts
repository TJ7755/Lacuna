import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import {
  chooseScheduledStudy,
  continueStudyReportByKeyboard,
  enterFreshLacuna,
} from './fixtures/lacunaApp';

test('a keyboard-only learner moves from notes through a finished step without the mouse', async ({
  page,
}) => {
  await enterFreshLacuna(page);
  const bundle = await build({
    stdin: {
      contents: `
        import { createCourse, createLesson, createLessonCard, createNote } from './apps/web/src/db/repository';
        export async function seed() {
          const course = await createCourse('Keyboard study', { learnFirst: true, lessonViewMode: 'study' });
          const first = await createLesson(course.id, 'Plants');
          const next = await createLesson(course.id, 'Circulation');
          await createNote(first.id, 'Overview', 'Xylem carries water.');
          await createLessonCard(course.id, first.id, 'front_back', 'Which tissue carries water?', 'Xylem');
          await createLessonCard(course.id, next.id, 'front_back', 'What pumps blood?', 'The heart');
          return course.id;
        }
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'KeyboardStudyFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const courseId = await page.evaluate(() =>
    (
      window as unknown as { KeyboardStudyFixture: { seed(): Promise<string> } }
    ).KeyboardStudyFixture.seed(),
  );
  await page.goto(`/#/course/${courseId}`);
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await chooseScheduledStudy(page);

  await expect(page.getByRole('button', { name: 'Continue', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');

  const study = page.getByRole('main', { name: 'Study card' });
  const continueCard = study.getByRole('button', { name: 'Continue', exact: true });
  await expect(
    study.getByRole('button', { name: 'Show answer', exact: true }).last(),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(continueCard).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(study.getByRole('textbox', { name: 'Your answer' })).toBeFocused();
  await page.keyboard.insertText('Xylem');
  await page.keyboard.press('Enter');
  await expect(continueCard).toBeFocused();
  await page.keyboard.press('Enter');

  await continueStudyReportByKeyboard(page);
  const finished = page.getByRole('main', { name: 'Study progress' });
  await expect(finished.getByRole('button', { name: /^Continue/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(finished).toBeHidden();
});
