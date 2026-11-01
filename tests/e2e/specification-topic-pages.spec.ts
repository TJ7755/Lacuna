import { expect, test } from '@playwright/test';
import { libraryCourses } from '../../apps/web/src/library/catalogue';
import {
  courseTopicPath,
  courseSubjectPath,
  courseBoardPath,
} from '../../apps/web/src/pages/courses/topic-paths';
import samples from '../../apps/web/src/pages/courses/topic-samples.json' with { type: 'json' };

test('specification samples work without the application bundle', async ({ browser }, testInfo) => {
  const source = samples[0];
  const course = libraryCourses.find((item) => item.id === source.courseId)!;
  const topic = source.topics[0];
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const path = courseTopicPath(course, topic.id);
  await page.goto(path);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(topic.title);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `https://getlacuna.app${path}`,
  );
  expect(await page.locator('script[src]').count()).toBe(0);
  expect(
    JSON.parse(await page.locator('script[type="application/ld+json"]').innerText())['@type'],
  ).toBe('LearningResource');
  await expect(page.getByRole('link', { name: 'Open this course in Lacuna' })).toHaveAttribute(
    'href',
    course.shareUrl!,
  );
  await page.getByText('Show answer', { exact: true }).first().click();
  await expect(page.getByText(topic.flashcards[0].answer, { exact: true })).toBeVisible();
  for (const target of await page.getByRole('link').all()) {
    const box = await target.boundingBox();
    if (box && box.x >= 0) expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: testInfo.outputPath('specification-topic-desktop.png'),
    fullPage: true,
  });
  await page.goto(courseSubjectPath(course));
  await expect(page.getByRole('link', { name: topic.title, exact: true })).toHaveAttribute(
    'href',
    path,
  );
  await page.goto(courseBoardPath(course));
  await expect(
    page.getByRole('link', { name: `${course.subject} ${course.code}`, exact: true }),
  ).toHaveAttribute('href', courseSubjectPath(course));
  await page.goto('/courses/');
  await page.screenshot({ path: testInfo.outputPath('course-index-desktop.png'), fullPage: true });
  await context.close();
});
