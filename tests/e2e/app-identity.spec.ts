import { expect, test } from '@playwright/test';

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1440]) {
    test(`landing identity carries into the app: ${theme}, ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem('lacuna-theme', theme), theme);
      await page.goto('/');
      await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
      const heading = page.getByRole('heading', { name: 'Courses', exact: true });
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS('font-family', /Instrument Sans/);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('16px "Instrument Sans"'))).toBe(true);
      await expect(heading.locator('xpath=ancestor::header')).toHaveCSS('border-top-width', '0px');
      await expect(heading.locator('xpath=ancestor::header')).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath('courses.png'),
      });
      const dashboardUrl = page.url();
      await page.getByRole('button', { name: /Exam in .* Welcome to Lacuna/ }).click();
      const course = page.getByRole('heading', {
        name: 'Welcome to Lacuna',
        exact: true,
        level: 1,
      });
      await expect(course).toBeVisible();
      await expect(course).toHaveCSS('font-family', /Instrument Sans/);
      await expect(course.locator('xpath=ancestor::header')).toHaveCSS('border-top-width', '0px');
      await page.getByRole('button', { name: 'Author mode', exact: true }).click();
      await page.getByRole('button', { name: 'Rename course', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'course name', exact: true })).toBeFocused();
      await page.getByRole('textbox', { name: 'course name', exact: true }).press('Escape');
      await expect(course).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('course.png') });
      await page.goto(dashboardUrl);
      await page
        .getByRole('button', { name: /Exam in .* Welcome to Lacuna/ })
        .click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Archive', exact: true }).click();
      await page.getByRole('button', { name: 'Archive course', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Archive Welcome to Lacuna?' })).toHaveCount(0);
      const emptyHeading = page.getByRole('heading', { name: 'No active courses' });
      await expect(emptyHeading).toBeVisible();
      const drawing = emptyHeading.locator('..').locator('svg[viewBox="0 0 88 82"]');
      await expect(drawing).toBeVisible();
      await expect(drawing).toHaveAttribute('aria-hidden', 'true');
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('empty.png') });
      await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Course name', exact: true })).toBeFocused();
    });
  }
}

test('an empty study session carries the recall drawing into its report', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).first().click();
  await page.getByRole('button', { name: /Exam in .* Welcome to Lacuna/ }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  await page.goto(`${page.url()}/learn`);
  await expect(page.getByRole('heading', { name: 'Nice work' })).toBeVisible();
  const drawing = page.locator('svg[viewBox="0 0 88 82"]');
  await expect(drawing).toBeVisible();
  await expect(drawing).toHaveAttribute('aria-hidden', 'true');
  await page.screenshot({ animations: 'disabled', path: test.info().outputPath('session.png') });
});

for (const width of [390, 1440]) {
  test(`landing FAQ opens with the keyboard at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/#/landing');
    const faq = page.getByRole('region', { name: 'A few questions.' });
    await expect(faq.locator('details')).toHaveCount(4);
    const question = faq.locator('summary').first();
    await question.focus();
    await question.press('Enter');
    await expect(
      faq.getByText('Yes. Lacuna is free and open source, with no subscription.'),
    ).toBeVisible();
    await faq.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await faq.getByRole('heading').click();
    await faq.screenshot({ animations: 'disabled', path: test.info().outputPath('faq.png') });
    await question.press('Enter');
    await expect(faq.locator('details').first()).not.toHaveAttribute('open', '');
  });
}
