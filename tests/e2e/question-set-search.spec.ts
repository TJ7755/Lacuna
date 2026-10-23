import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`finds prompt wording and replaces a saved path activity at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    // Create on desktop; the assertions and picker captures use the target viewport.
    await page.setViewportSize({ width: 1280, height: 844 });
    await createCourse(page, 'Biology search');
    const coursePath = new URL(page.url()).hash.slice(1);
    await page.goto(`/#${coursePath}/questions`);
    await page.getByRole('button', { name: 'New question set', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Cell practice');
    await page.keyboard.press('Enter');
    await page
      .getByRole('textbox', { name: 'Q1 question', exact: true })
      .fill('Explain selective permeability in a cell membrane.');
    await page
      .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
      .fill('Secret marking criterion');
    await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Control+Enter');
    await expect(page).toHaveURL(/question-sets\/[^/]+$/);
    await page.goto(`/#${coursePath}/questions`);
    await page.getByRole('button', { name: 'New question set', exact: true }).click();
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill('Tissue practice');
    await page.keyboard.press('Enter');
    await page
      .getByRole('textbox', { name: 'Q1 question', exact: true })
      .fill('Explain how specialised cells form tissues.');
    await page
      .getByRole('textbox', { name: 'Q1 mark scheme', exact: true })
      .fill('Cells work together.');
    await page.getByRole('textbox', { name: 'Q1 question', exact: true }).press('Control+Enter');
    await expect(page).toHaveURL(/question-sets\/[^/]+$/);
    await page.goto(`/#${coursePath}/questions`);
    await page.setViewportSize({ width, height: 844 });
    const librarySearch = page.getByRole('searchbox', { name: 'Search sets' });
    await librarySearch.fill('selective permeability');
    await expect(page.getByRole('heading', { name: 'Cell practice', exact: true })).toBeVisible();
    await expect(page.getByText(/Question 1: Explain selective permeability/)).toBeVisible();
    await expect(page.getByText('Secret marking criterion', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`library-${width}.png`) });
    await librarySearch.fill('secret marking criterion');
    await expect(page.getByRole('heading', { name: 'Cell practice', exact: true })).toBeVisible();
    await expect(
      page.getByText('Mark scheme: Question 1 criterion: Secret marking criterion'),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`author-mark-scheme-${width}.png`) });
    await page.goto(`/#${coursePath}`);
    await page.getByRole('button', { name: 'View mode', exact: true }).click();
    await page.goto(`/#${coursePath}/questions`);
    await librarySearch.fill('secret marking criterion');
    await expect(page.getByRole('heading', { name: 'No matching sets' })).toBeVisible();
    await expect(page.getByText(/Secret marking criterion/)).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`learner-mark-scheme-${width}.png`) });
    await librarySearch.fill('selective permeability');
    await expect(page.getByRole('heading', { name: 'Cell practice', exact: true })).toBeVisible();
    await page.goto(`/#${coursePath}`);
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    for (const action of ['Cancel', 'Escape', 'backdrop']) {
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('menuitem', { name: 'Practice questions', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Add practice questions', exact: true });
      await editor.getByRole('button', { name: 'Choose a question set', exact: true }).click();
      const child = page.getByRole('dialog', { name: 'Choose a question set', exact: true });
      await expect(child.getByRole('radio', { name: /Cell practice/ })).toBeVisible();
      await child.getByRole('searchbox').press('Escape');
      await expect(child).toBeHidden();
      await expect(editor).toBeVisible();
      await editor.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(editor.getByRole('alert')).toHaveText('Choose a question set.');
      if (action === 'Cancel') {
        await page.screenshot({ path: test.info().outputPath(`editor-cancel-${width}.png`) });
        await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
      } else if (action === 'Escape') {
        await editor
          .getByRole('button', { name: 'Choose a question set', exact: true })
          .press('Escape');
      } else {
        await page.locator('[data-path-editor-backdrop]').click({ position: { x: 2, y: 2 } });
      }
      await expect(editor).toBeHidden();
      await expect(page.getByRole('button', { name: 'Add', exact: true })).toBeFocused();
      await expect(
        page.getByRole('button', { name: 'Practice questions: Cell practice', exact: true }),
      ).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Practice questions', exact: true }).click();
    await page.getByRole('button', { name: 'Choose a question set', exact: true }).click();
    const picker = page.getByRole('dialog', { name: 'Choose a question set', exact: true });
    const search = picker.getByRole('searchbox', { name: 'Search question sets' });
    await expect(search).toBeFocused();
    await search.fill('selective permeability');
    const choice = picker.getByRole('radio', { name: /Cell practice/ });
    await expect(choice).toBeVisible();
    await expect(picker.getByText(/Question 1: Explain selective permeability/)).toBeVisible();
    await expect(picker.getByText(/1 question · 1 answerable part · 1 mark/)).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`picker-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await search.press('Tab');
    await expect(choice).toBeFocused();
    await choice.press('Space');
    await expect(choice).toBeChecked();
    await choice.press('Escape');
    const trigger = page.getByRole('button', { name: 'Choose a question set', exact: true });
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await expect(search).toBeFocused();
    await expect(choice).not.toBeChecked();
    await search.fill('secret marking criterion');
    await expect(choice).toBeVisible();
    await expect(
      picker.getByText('Mark scheme: Question 1 criterion: Secret marking criterion'),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`picker-mark-scheme-${width}.png`) });
    await search.fill('selective permeability');
    await search.press('Tab');
    await choice.press('Space');
    await choice.press('Tab');
    await expect(picker.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(picker).toBeHidden();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Practice questions: Cell practice', exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Practice questions: Cell practice', exact: true }),
    ).toBeVisible();
    const activity = page.getByRole('button', {
      name: 'Practice questions: Cell practice',
      exact: true,
    });
    await activity.click();
    const editor = page.getByRole('dialog', { name: 'Edit practice questions', exact: true });
    const current = editor.getByRole('button', { name: 'Cell practice', exact: true });
    await current.press('Enter');
    await expect(search).toBeFocused();
    await expect(picker.getByRole('radio', { name: /Cell practice/ })).toBeChecked();
    await search.fill('specialised cells');
    const replacement = picker.getByRole('radio', { name: /Tissue practice/ });
    await search.press('Tab');
    await expect(replacement).toBeFocused();
    await replacement.press('Space');
    await replacement.press('Escape');
    await expect(current).toBeFocused();
    await current.press('Enter');
    await expect(picker.getByRole('radio', { name: /Cell practice/ })).toBeChecked();
    await search.fill('specialised cells');
    await replacement.check();
    await picker.getByRole('button', { name: 'Use question set', exact: true }).click();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(activity).toBeVisible();
    await activity.click();
    await current.click();
    await search.fill('specialised cells');
    await replacement.check();
    await picker.getByRole('button', { name: 'Use question set', exact: true }).click();
    await page.screenshot({ path: test.info().outputPath(`replacement-editor-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await editor.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(activity).toHaveCount(0);
    const saved = page.getByRole('button', {
      name: 'Practice questions: Tissue practice',
      exact: true,
    });
    await expect(saved).toBeVisible();
    await page.reload();
    await expect(saved).toBeVisible();
    await saved.click();
    await editor.getByRole('button', { name: 'Tissue practice', exact: true }).click();
    await expect(picker.getByRole('radio', { name: /Tissue practice/ })).toBeChecked();
    await page.screenshot({ path: test.info().outputPath(`replacement-picker-${width}.png`) });
    await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
    await editor.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'View mode', exact: true }).click();
    await saved.click();
    await expect(page.getByRole('heading', { name: 'Tissue practice', exact: true })).toBeVisible();
  });
}
