import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { createCourse, enterFreshLacuna, openImport } from './fixtures/lacunaApp';

const wrappingName = 'BREAKER <script>alert(1)</script> / \\ NULL '.repeat(30).trim();
const tokenName = 'LongCourseTitle'.repeat(80);

async function expectContainedTitle(page: Page, name: string, lesson: string) {
  const heading = page.getByRole('heading', { level: 1, name, exact: true });
  await expect(heading).toBeVisible();
  await expect(heading).toHaveText(name);
  const bounds = await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      height: rect.height,
      lineHeight: parseFloat(getComputedStyle(element).lineHeight),
      right: rect.right,
      viewportWidth: window.innerWidth,
    };
  });
  expect(bounds.height).toBeLessThanOrEqual(bounds.lineHeight * 3 + 1);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
  await expect(page.getByRole('button', { name: lesson, exact: true })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toBeInViewport();
}

for (const width of [1280, 640]) {
  test(`long saved course titles keep lessons reachable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await createCourse(page, wrappingName, false);
    await page.setViewportSize({ width, height: 800 });
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: wrappingName })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('saved-wrapping-title.png') });
    await expectContainedTitle(page, wrappingName, 'Lesson 1');

    await page.getByRole('button', { name: 'Edit mode', exact: true }).click();
    const rename = page.getByRole('button', { name: 'Rename course', exact: true });
    await rename.focus();
    await rename.press('Enter');
    const input = page.getByRole('textbox', { name: 'Course name', exact: true });
    await expect(input).toBeFocused();
    await expect(input).toHaveValue(wrappingName);
    await input.press('Escape');
    await expect(rename).toBeFocused();
    await rename.press('Enter');
    await input.fill(tokenName);
    await input.press('Enter');
    await expect(rename).toBeFocused();
    await page.reload();
    await expectContainedTitle(page, tokenName, 'Lesson 1');
    await page.screenshot({ path: testInfo.outputPath('renamed-long-token.png') });
    await page.getByRole('button', { name: 'Rename course', exact: true }).press('Enter');
    await expect(input).toHaveValue(tokenName);
    await input.press('Escape');
    await page.getByRole('button', { name: 'View mode', exact: true }).click();
    await expectContainedTitle(page, tokenName, 'Lesson 1');
    await page.getByRole('button', { name: 'Lesson 1', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Lesson 1', exact: true }),
    ).toBeVisible();
  });
}

test('an imported long course title retains its full accessible name', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const file = JSON.parse(
    readFileSync(new URL('./fixtures/welcome-course.lacuna', import.meta.url), 'utf8'),
  );
  file.payload.course.n = wrappingName;
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'long-course.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  });
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  await page
    .getByRole('radio', { name: /Exam date/ })
    .locator('..')
    .click();
  await page.getByRole('button', { name: 'Add to my courses' }).click();
  await page
    .getByRole('navigation', { name: 'Courses', exact: true })
    .getByRole('link', { name: wrappingName, exact: true })
    .click();
  await page.reload();
  await expectContainedTitle(page, wrappingName, 'Core concepts & rendering');
  await page.screenshot({ path: testInfo.outputPath('imported-long-title.png') });
});
