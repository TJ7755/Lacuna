import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test('the Question editor footer clears the phone course bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await createCourse(page, 'Footer course');
  const courseId = new URL(page.url()).hash.split('/')[2];

  await page.goto(`/#/course/${courseId}/questions/new`);
  await page.getByPlaceholder('Completing the square').fill('Footer question');
  await page.getByPlaceholder('A single piece of knowledge').fill('Footer concept');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'Generated family' }).click();
  await page.getByRole('button', { name: 'Create Question' }).click();
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/questions\\?view=individual$`));

  // Seeded at desktop width, where the section bar is absent; the editor is then
  // opened at phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Edit Footer question', exact: true }).click();
  const save = page.getByRole('button', { name: 'Save Question' });
  await expect(save).toBeVisible();

  const sectionBar = page.locator('nav[aria-label="Course sections"]:visible');
  const footer = save.locator('xpath=ancestor::div[contains(@class,"sticky")][1]');
  await expect(footer).toHaveCSS('position', 'sticky');
  const barTop = (await sectionBar.boundingBox())!.y;
  const footerBottom = await footer.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footerBottom).toBeLessThanOrEqual(barTop + 0.5);

  const remove = page.getByRole('button', { name: 'Delete', exact: true });
  await remove.click({ trial: true });
  await save.click({ trial: true });

  await remove.click();
  // The outgoing trigger can remain mounted while the inline confirmation enters.
  const confirmation = footer
    .getByText('Delete this Question definition? Its attempt evidence will be retained.', {
      exact: true,
    })
    .locator('..');
  const confirm = confirmation.getByRole('button', { name: 'Delete', exact: true });
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await confirm.click({ trial: true });
  await cancel.click({ trial: true });
});

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Question entry requires a Concept choice and retains it across repeat and edit (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Deliberate Concepts');
    const courseId = new URL(page.url()).hash.split('/')[2];
    const editorUrl = `/#/course/${courseId}/questions/new`;
    const concept = page.getByRole('combobox', { name: /^Primary skill practised/ });
    const name = page.getByPlaceholder('Completing the square');
    const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
    const explanation = page.getByRole('textbox', { name: 'Worked explanation', exact: true });
    const answer = page.getByRole('textbox', { name: 'Expected answer', exact: true });

    // Create the existing Course Concepts through the supported editor controls.
    await page.goto(editorUrl);
    await page.getByPlaceholder('A single piece of knowledge').fill('Another skill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(concept).not.toHaveValue('');
    await page.getByPlaceholder('A single piece of knowledge').fill('Chosen skill');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByPlaceholder('A single piece of knowledge')).toHaveValue('');
    const chosenId = await concept.inputValue();
    await expect(concept.locator('option').nth(1)).toHaveText('Another skill');
    await page.getByRole('button', { name: 'Generated family' }).click();
    await name.fill('Existing generated family');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(page.getByRole('heading', { name: 'Individual questions' })).toBeVisible();

    await page.getByRole('button', { name: 'New question', exact: true }).click();
    await expect(prompt).toBeFocused();
    await expect(concept).toHaveValue('');
    await prompt.fill('What is 2 + 2?');
    await answer.fill('4');
    await explanation.fill('Combine the two pairs.');
    await name.fill('First explicit Question');
    await name.press('Control+Enter');
    await expect(concept).toBeFocused();
    await expect(concept).toHaveAccessibleDescription('Choose the primary skill practised.');
    await expect(prompt).toHaveValue('What is 2 + 2?');
    await concept.selectOption({ label: 'Chosen skill' });
    await page
      .getByRole('combobox', { name: 'Lesson', exact: true })
      .selectOption({ label: 'Lesson 1' });
    await page.getByRole('button', { name: 'Another skill', exact: true }).click();
    await page.getByRole('button', { name: 'Save & add another' }).click();
    await expect(prompt).toHaveValue('');
    await expect(prompt).toBeFocused();
    await expect(concept).toHaveValue(chosenId);
    await expect(page.getByRole('combobox', { name: 'Lesson', exact: true })).not.toHaveValue('');
    await expect(page.getByRole('button', { name: 'Another skill', exact: true })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await prompt.fill('What is 3 + 3?');
    await answer.fill('6');
    await explanation.fill('Combine the two triples.');
    await name.fill('Second explicit Question');
    await name.press('Meta+Enter');
    await expect(prompt).toHaveValue('');
    await expect(concept).toHaveValue(chosenId);
    await page.reload();
    await expect(concept).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Restore draft' })).toHaveCount(0);
    await prompt.press('Escape');
    await expect(page.getByRole('heading', { name: 'Individual questions' })).toBeVisible();

    for (const questionName of ['First explicit Question', 'Second explicit Question']) {
      await page.getByRole('link', { name: `Edit ${questionName}`, exact: true }).click();
      await expect(concept).toHaveValue(chosenId);
      await expect(name).toHaveValue(questionName);
      await expect(answer).toHaveValue(questionName.startsWith('First') ? '4' : '6');
      await expect(
        page.getByRole('button', { name: 'Another skill', exact: true }),
      ).toHaveAttribute('aria-pressed', questionName.startsWith('First') ? 'true' : 'false');
      await name.fill(`${questionName} edited`);
      await page.getByRole('button', { name: 'Save Question' }).click();
      await expect(page.getByRole('heading', { name: 'Individual questions' })).toBeVisible();
    }
  });
}

for (const reducedMotion of ['reduce', 'no-preference'] as const) {
  test(`Question validation focuses the answer and invalid generator field (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await createCourse(page, 'Question validation');
    const courseId = new URL(page.url()).hash.split('/')[2];
    await page.goto(`/#/course/${courseId}/questions/new`);
    const prompt = page.getByRole('textbox', { name: 'Prompt', exact: true });
    const answer = page.getByRole('textbox', { name: 'Expected answer', exact: true });
    await prompt.fill('What is 2 + 2?');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(answer).toBeFocused();
    await expect(page.getByText('Add a valid answer.', { exact: true })).toBeVisible();
    await expect(prompt).toHaveValue('What is 2 + 2?');
    await answer.fill('4');
    await answer.press('Control+Enter');
    await expect(
      page.getByRole('textbox', { name: 'Worked explanation', exact: true }),
    ).toBeFocused();

    await page.getByRole('button', { name: 'Generated family' }).click();
    const name = page.getByPlaceholder('Completing the square');
    await name.fill('Validated quadratic family');
    await page.getByPlaceholder('A single piece of knowledge').fill('Quadratic roots');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    const minimum = page.getByRole('spinbutton', { name: 'Minimum root magnitude', exact: true });
    await minimum.fill('10');
    await name.press('Meta+Enter');
    await expect(minimum).toBeFocused();
    await expect(minimum).toHaveValue('10');
    await expect(minimum).toHaveAttribute('aria-invalid', 'true');
    await expect(minimum).toHaveAccessibleDescription(
      'Use a minimum root magnitude no greater than the maximum.',
    );
    await expect(name).toHaveValue('Validated quadratic family');
    await minimum.fill('3');
    await expect(minimum).toBeFocused();
    await expect(minimum).not.toHaveAttribute('aria-invalid', 'true');
    await page.getByRole('button', { name: 'Create Question' }).click();
    await expect(page.getByRole('heading', { name: 'Individual questions' })).toBeVisible();
    await page.getByRole('link', { name: 'Edit Validated quadratic family', exact: true }).click();
    await expect(minimum).toHaveValue('3');
    await expect(
      page.getByRole('combobox', { name: 'Primary skill practised', exact: true }),
    ).toHaveValue(/.+/);
  });
}
