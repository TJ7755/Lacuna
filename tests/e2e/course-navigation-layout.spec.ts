import { expect, test, type Page } from '@playwright/test';

const COURSE_SECTIONS = [
  { label: 'Path', heading: 'Curriculum' },
  { label: 'Cards', heading: 'Cards' },
  { label: 'Questions', heading: 'Questions' },
  { label: 'Analytics', heading: 'Analytics' },
  { label: 'Settings', heading: 'Settings' },
] as const;

test('course section navigation keeps one stable horizontal position', async ({ page }) => {
  await openSeededCourse(page);
  const positions: Array<{ label: string; centreX: number }> = [];

  for (const section of COURSE_SECTIONS) {
    const navigation = page.locator('nav[aria-label="Course sections"]:visible');
    if (section.label !== 'Path') {
      await navigation.getByRole('link', { name: section.label, exact: true }).click();
      await expect(
        page.getByRole('heading', { name: section.heading, exact: true }).first(),
      ).toBeVisible();
    }

    await expect(navigation).toHaveCount(1);
    const bounds = await navigation.boundingBox();
    expect(bounds, `${section.label} navigation must be visible`).not.toBeNull();
    positions.push({
      label: section.label,
      centreX: (bounds?.x ?? 0) + (bounds?.width ?? 0) / 2,
    });
  }

  const baseline = positions[0];
  for (const position of positions.slice(1)) {
    expect(
      Math.abs(position.centreX - baseline.centreX),
      `${position.label} navigation moved relative to ${baseline.label}`,
    ).toBeLessThanOrEqual(1);
  }
});

async function openSeededCourse(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Lacuna', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Curriculum', exact: true })).toBeVisible();
}
