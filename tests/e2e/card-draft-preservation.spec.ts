import { expect, test } from '@playwright/test';
import { createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

test.use({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });

for (const exit of ['Escape', 'Cancel', 'breadcrumb', 'sidebar', 'reload'] as const) {
  test(`keeps the latest card draft after immediate ${exit}`, async ({ page }, testInfo) => {
    await enterFreshLacuna(page);
    const courseUrl = await createCourse(page, 'Biology', false);
    const editorUrl = `${courseUrl}/cards/new`;
    await page.goto(editorUrl);
    const front = page.getByRole('textbox', { name: 'Front', exact: true });
    const back = page.getByRole('textbox', { name: 'Back', exact: true });
    await front.fill('What does the nucleus do?');
    await back.fill('Controls the activities of the cell.');
    // Leave immediately after the input, without waiting for the autosave delay.
    if (exit === 'Escape') await back.press('Escape');
    else if (exit === 'reload') await page.reload();
    else if (exit === 'sidebar') {
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Today', exact: true })
        .click();
    } else if (exit === 'breadcrumb') {
      await page.locator('main header').getByRole('link', { name: 'Cards', exact: true }).click();
    } else await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    if (exit !== 'reload') await expect(page).not.toHaveURL(editorUrl);
    await page.goto(editorUrl);
    await expect(page.getByRole('button', { name: 'Restore draft' })).toBeVisible();
    if (exit === 'Escape') {
      await page.screenshot({ path: testInfo.outputPath('saved-draft.png') });
    }
    await page.getByRole('button', { name: 'Restore draft' }).click();
    await expect(front).toHaveValue('What does the nucleus do?');
    await expect(back).toHaveValue('Controls the activities of the cell.');
    if (exit === 'Escape') {
      await page.screenshot({ path: testInfo.outputPath('restored-draft.png') });
    }
  });
}
