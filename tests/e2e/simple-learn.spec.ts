import { expect, test } from '@playwright/test';
import { addLessonNote, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const width of [1280, 390]) {
  test(`keeps optional Simple Learn inside Other ways at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 844 });
    await enterFreshLacuna(page);
    await createCourse(page, 'Anytime revision');
    await addLessonNote(page, 'Overview');
    await page.setViewportSize({ width, height: 844 });
    await page.getByRole('button', { name: 'Study', exact: true }).click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await expect(preview).toBeVisible();
    await expect(preview.getByText('Practise until all correct')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await page.getByRole('button', { name: 'Other ways to study' }).click();
    await page.getByRole('menuitem', { name: 'Practise until all correct' }).click();
    const practice = page.getByRole('group', { name: 'Other ways to study' });
    const scope = practice.getByLabel('What to practise');
    await expect(scope).toHaveCSS('appearance', 'base-select');
    await expect(scope).toHaveValue('');
    await scope.selectOption({ label: 'Lesson 1' });

    await expect(practice.getByRole('button', { name: 'Start practising' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await scope.click();
    await expect.poll(() => scope.evaluate((element) => element.matches(':open'))).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`simple-learn-${width}.png`) });
    await page.keyboard.press('Escape');

    await expect(practice).toBeVisible();
    await practice.getByRole('button', { name: 'Start practising' }).click();
    await expect(page).toHaveURL(/#\/lesson\/[^/]+\/learn\?mode=simple$/);
    await expect(practice).toBeHidden();
  });
}
