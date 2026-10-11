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
  await page.locator('a[href*="/questions/"][href$="/edit"]').first().click();
  const save = page.getByRole('button', { name: 'Save Question' });
  await expect(save).toBeVisible();

  const sectionBar = page.locator('nav[aria-label="Course sections"]:visible');
  const footer = save.locator('xpath=ancestor::div[contains(@class,"fixed")][1]');
  const barTop = (await sectionBar.boundingBox())!.y;
  const footerBottom = await footer.evaluate((el) => el.getBoundingClientRect().bottom);
  expect(footerBottom).toBeLessThanOrEqual(barTop + 0.5);

  const remove = page.getByRole('button', { name: 'Delete', exact: true });
  await remove.click({ trial: true });
  await save.click({ trial: true });

  await remove.click();
  // The outgoing trigger can remain mounted while the inline confirmation enters.
  const confirmation = footer
    .getByText('Delete this Question definition? Its attempt evidence will be retained.', { exact: true })
    .locator('..');
  const confirm = confirmation.getByRole('button', { name: 'Delete', exact: true });
  const cancel = confirmation.getByRole('button', { name: 'Cancel', exact: true });
  await confirm.click({ trial: true });
  await cancel.click({ trial: true });
});
