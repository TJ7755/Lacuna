import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

async function writeRow(page: Page, label: string, prompt: string, scheme: string) {
  const question = page.getByRole('textbox', { name: `${label} question`, exact: true });
  await expect(question).toBeFocused();
  await question.fill(prompt);
  await question.press('Tab');
  const marking = page.getByRole('textbox', { name: `${label} mark scheme`, exact: true });
  await expect(marking).toBeFocused();
  await marking.fill(scheme);
  await marking.press('Tab');
  const marks = page.getByRole('spinbutton', { name: `${label} marks`, exact: true });
  await expect(marks).toBeFocused();
  return marks;
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`keyboard authoring publishes plain, multipart and multiple-choice questions (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Composer keyboard');
    const coursePath = new URL(page.url()).hash.slice(1);
    await page.goto(`/#${coursePath}/questions`);
    await page.getByRole('button', { name: 'New question set', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Forces and motion');
    await page.keyboard.press('Enter');
    const title = page.getByRole('heading', { name: 'Forces and motion', exact: true });
    await expect(title).not.toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Q1 question', exact: true })).toBeFocused();
    await (await writeRow(page, 'Q1', 'State the unit of force.', 'Newton')).press('Enter');
    await (
      await writeRow(page, 'Q2', 'Define acceleration.', 'Change in velocity per second')
    ).press('Enter');
    await (
      await writeRow(page, 'Q3', 'A car accelerates from rest.', 'Use F = ma (2)')
    ).press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByText('Mark scheme moved into (a)')).toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Q3 (a) mark scheme', exact: true }),
    ).toHaveValue('Use F = ma (2)');
    await (await writeRow(page, 'Q3 (a)', 'Calculate the force.', 'Use F = ma (2)')).press('Enter');
    await (
      await writeRow(page, 'Q3 (b)', 'Consider its motion.', 'Velocity increases')
    ).press('Enter');
    await page.keyboard.press('Tab');
    await (
      await writeRow(page, 'Q3 (b) (i)', 'Describe the velocity.', 'Velocity increases')
    ).press('Enter');
    await writeRow(page, 'Q3 (b) (ii)', 'State the direction.', 'Forwards');
    await page.getByRole('button', { name: '+ Question', exact: true }).click();
    const mcq = page.getByRole('textbox', { name: 'Q4 question', exact: true });
    await mcq.fill('Which quantity is a vector?');
    await mcq.press('Shift+F10');
    await page.getByRole('menuitem', { name: 'Multiple choice', exact: true }).click();
    await page.getByRole('textbox', { name: 'Option 1', exact: true }).fill('Velocity');
    await page.getByRole('textbox', { name: 'Option 2', exact: true }).fill('Speed');
    await page.getByRole('radio', { name: 'Option 1 is correct', exact: true }).check();
    await page.getByRole('textbox', { name: 'Q4 mark scheme', exact: true }).fill('Velocity');
    await expect(page.getByRole('button', { name: 'Q4 row options', exact: true })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await page.getByRole('button', { name: 'Back to composer', exact: true }).click();
    await expect(title).not.toBeFocused();
    await mcq.focus();
    await mcq.press('Control+Enter');
    await expect(page).toHaveURL(/question-sets\/[^/]+$/);
    await expect(page.getByRole('button', { name: 'Start attempt', exact: true })).toBeVisible();
  });
}
