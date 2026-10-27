import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const width of [390, 1440]) {
  test(`Study keeps alternatives inside one usable surface at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterWithWelcomeCourse(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
      .click();
    const study = page.getByRole('button', { name: 'Study', exact: true });
    await expect(study).toHaveCount(1);
    await study.click();
    const preview = page.getByRole('region', { name: 'Session preview' });
    await expect(preview).toHaveCount(1);
    await expect(
      preview.getByRole('list', { name: "Today's session" }).getByRole('listitem'),
    ).toHaveCount(1);
    const otherWays = preview.getByRole('button', { name: 'Other ways', exact: true });
    await otherWays.click();
    const alternatives = preview.getByRole('region', { name: 'Other ways', exact: true });
    await expect(alternatives).toBeVisible();
    const chooseQuestions = alternatives.getByRole('button', {
      name: 'Choose exam questions',
      exact: true,
    });
    await chooseQuestions.scrollIntoViewIfNeeded();
    await expect(chooseQuestions).toBeInViewport();
    const bounds = (await preview.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`study-alternatives-${width}.png`) });
    await otherWays.click();
    await expect(alternatives).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(study).toBeFocused();
  });
}
