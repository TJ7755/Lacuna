import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function expectNoVisibleEyebrows(page: Page) {
  const offenders = await page.locator('body *').evaluateAll((elements) =>
    elements.flatMap((element) => {
      const style = getComputedStyle(element);
      const text = element.textContent?.trim();
      const fontSize = Number.parseFloat(style.fontSize);
      const letterSpacing = Number.parseFloat(style.letterSpacing);
      const visible = element.getClientRects().length > 0;

      return visible &&
        Boolean(text) &&
        style.textTransform === 'uppercase' &&
        fontSize <= 12 &&
        letterSpacing >= fontSize * 0.08
        ? [`${element.tagName.toLowerCase()}: ${text!.slice(0, 80)}`]
        : [];
    }),
  );

  expect(offenders).toEqual([]);
}

test('key public and editing screens have no visible eyebrow captions', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/welcome');
  await expect(page.locator('main')).toBeVisible();
  await expectNoVisibleEyebrows(page);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('welcome.png'),
  });

  await enterFreshLacuna(page);
  await expectNoVisibleEyebrows(page);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('dashboard.png'),
  });

  await page
    .getByRole('complementary')
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const courseId = /#\/course\/([^/]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  await expect(page.locator('main')).toBeVisible();
  await expectNoVisibleEyebrows(page);
  await page.screenshot({
    animations: 'disabled',
    path: test.info().outputPath('course.png'),
  });

  const screens = [
    ['card-editor', `/#/course/${courseId}/cards/new`],
    ['question-editor', `/#/course/${courseId}/questions/new`],
    ['sequence-editor', `/#/course/${courseId}/sequence/new`],
    ['occlusion-editor', `/#/course/${courseId}/occlusion/new`],
    ['course-settings', `/#/course/${courseId}/settings`],
    ['settings', '/#/settings'],
    ['search', '/#/search'],
    ['import', '/#/import'],
    ['share', '/#/share'],
  ] as const;

  for (const [name, path] of screens) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expectNoVisibleEyebrows(page);
    await page.screenshot({
      animations: 'disabled',
      path: test.info().outputPath(`${name}.png`),
    });
  }
});
