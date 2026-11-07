import { build } from 'esbuild';
import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import type * as ChoiceFixture from './fixtures/simpleLearnChoices';

declare global {
  interface Window {
    SimpleLearnChoicesFixture: typeof ChoiceFixture;
  }
}

const cards: Record<string, string> = {
  'What is the French for apple?': 'pomme',
  'What is the French for pear?': 'poire',
  'What is the French for cherry?': 'cerise',
};

let fixture: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/simpleLearnChoices.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'SimpleLearnChoicesFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  fixture = bundle.outputFiles[0].text;
});

test('retries missed choices in Simple Learn without recording reviews', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.addScriptTag({ content: fixture });
  const { courseId, lessonId } = await page.evaluate(
    (seedCards) => window.SimpleLearnChoicesFixture.seed(seedCards),
    { ...cards, 'Name a fruit?': 'pomme', '**Name a fruit?**': 'poire' },
  );

  await page.goto(`/#/course/${courseId}`);
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  const preview = page.getByRole('region', { name: 'Session preview' });
  await preview.getByRole('button', { name: 'Other ways', exact: true }).click();
  await preview.getByText('Practise until all correct', { exact: true }).click();
  await preview.getByLabel('What to practise').selectOption({ label: 'Fruit' });
  await preview.getByLabel('Answer format').selectOption({ label: 'Multiple choice' });
  await preview.getByRole('button', { name: 'Start practising' }).click();
  await expect(page).toHaveURL(
    new RegExp(`#/lesson/${lessonId}/learn\\?mode=simple&format=multiple-choice$`),
  );

  const practice = page.getByRole('main', { name: 'Multiple choice' });
  const prompt = practice.getByRole('heading');
  const check = practice.getByRole('button', { name: 'Check answer', exact: true });
  const feedback = practice.getByRole('status');
  const advance = practice.getByRole('button', { name: 'Continue', exact: true });
  const choose = async (answer: string) => {
    const choice = practice.getByRole('radio', { name: answer, exact: true });
    await choice.focus();
    await choice.press('Space');
    await expect(choice).toBeChecked();
    await check.click();
  };

  await expect(practice.getByRole('radio')).toHaveCount(3);
  await expect(check).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('simple-learn-multiple-choice.png') });
  const firstPrompt = await prompt.innerText();
  const firstAnswer = cards[firstPrompt];
  const wrong = Object.values(cards).find((answer) => answer !== firstAnswer)!;
  await choose(wrong);
  await expect(feedback).toHaveText(`Incorrect. Correct answer: ${firstAnswer}`);
  await page.screenshot({ path: testInfo.outputPath('simple-learn-choice-feedback.png') });
  await advance.click();

  const remaining = new Set(Object.keys(cards).filter((text) => text !== firstPrompt));
  for (let index = 0; index < 2; index += 1) {
    const text = await prompt.innerText();
    expect(remaining.delete(text)).toBe(true);
    await choose(cards[text]);
    await expect(feedback).toHaveText('Correct.');
    await advance.click();
  }
  await expect(prompt).toHaveText(firstPrompt);
  await choose(firstAnswer);
  await advance.click();
  await expect(prompt).toHaveText('All questions answered correctly');

  await page.addScriptTag({ content: fixture });
  expect(await page.evaluate(() => window.SimpleLearnChoicesFixture.countReviews())).toBe(0);
  await practice.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}$`));

  // A normal review ignores the format query, even on the same lesson.
  await page.goto(`/#/lesson/${lessonId}/learn?filter=new&format=multiple-choice`);
  await expect(page.getByRole('button', { name: /Show answer/i }).last()).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
});
