import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

for (const width of [1280, 640]) {
  test(`a parent can identify the next step before choosing biology at ${width}px`, async ({
    page,
  }, info) => {
    test.skip(process.env.LACUNA_BROWSER_SITE === 'library');
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByRole('radio', { name: /^Not yet/ }).press('Space');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /^Course library/ }).click();
    await page.getByRole('button', { name: /^Biology \d+ courses$/ }).click();
    await expect(page.getByRole('list', { name: 'Biology courses', exact: true })).toBeVisible();
    await page.screenshot({ path: info.outputPath('biology-choices.png') });

    const guidance = page
      .locator('details')
      .filter({ hasText: 'Not sure which qualification to choose?' });
    await expect(guidance.locator('summary')).toBeVisible();
    await guidance.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(guidance).toContainText(
      'Combined Science includes biology, chemistry and physics',
    );
    await expect(guidance).toContainText('Biology is the separate qualification');
    await expect(guidance).toContainText('GCSE and IGCSE are different qualifications');
    await expect(guidance).toContainText('exam timetable or specification');
    await expect(guidance).toContainText('ask the school or teacher before choosing');
    await page.screenshot({ path: info.outputPath('qualification-guidance.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('qualification guidance is available before browsing the public library', async ({
  page,
}, info) => {
  test.skip(process.env.LACUNA_BROWSER_SITE !== 'library');
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  const summary = page.locator('summary', { hasText: 'Not sure which qualification to choose?' });
  await summary.click();
  await expect(page.locator('details')).toContainText('ask the school or teacher before choosing');
  await page.getByRole('searchbox', { name: 'Search courses' }).fill('biology');
  await expect(
    page.getByRole('region', { name: 'Courses' }).getByRole('button').first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('public-library-guidance.png') });
});
