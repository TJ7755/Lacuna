import { expect, test } from '@playwright/test';
import { enterWithWelcomeCourse } from './fixtures/lacunaApp';

test('course lessons fold without unmounting and rail hover cards wait for the moving edge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterWithWelcomeCourse(page);
  const aside = page.getByRole('complementary');
  const course = aside.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  const expander = aside.getByRole('button', { name: /^(Expand|Collapse) Welcome to Lacuna$/ });
  // The Welcome course may already be open on a fresh profile; fold it so the expansion is measured.
  if ((await expander.getAttribute('aria-expanded')) === 'true') {
    await expander.click();
    await expect(expander).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(600);
  }
  await expander.click();
  const lesson = aside.getByRole('link', {
    name: 'Core concepts & rendering',
    exact: true,
    includeHidden: true,
  });
  await expect(lesson).toBeVisible();
  const lessonNode = await lesson.elementHandle();
  const body = aside.locator(`[id="${await expander.getAttribute('aria-controls')}"]`);
  const height = await body
    .locator(':scope > div')
    .evaluate((content) => content.getBoundingClientRect().height);
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(height);
  await course.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await aside.evaluate((aside) =>
    aside.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click(),
  );
  await page.waitForTimeout(70);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const midHeight = (await body.boundingBox())!.height;
  expect(midHeight).toBeGreaterThan(0);
  expect(midHeight).toBeLessThan(height);
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(0);
  expect(await lessonNode!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(body).toHaveAttribute('inert');
  await expect(body).toHaveAttribute('aria-hidden', 'true');
  await expect(aside.getByRole('button', { name: /Welcome to Lacuna/ })).toHaveCount(0);
  await page.mouse.move(600, 900);
  await course.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect((await page.getByRole('tooltip').boundingBox())!.x).toBeGreaterThanOrEqual(72);
  await aside.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(height);
  await expect(lesson).toBeVisible();
});
