import { expect, test, type Page } from '@playwright/test';

async function openSeededDashboard(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('region', { name: 'From familiarity to recall' })).toBeVisible();
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
}

test('first launch reaches the seeded dashboard', async ({ page }) => {
  await openSeededDashboard(page);
  await expect(page.getByText('Welcome to Lacuna', { exact: true }).first()).toBeVisible();
  const searchButton = page.getByRole('button', { name: 'Quick search', exact: true });
  await expect(searchButton).toHaveText('Quick search');
  await expect(searchButton.locator('kbd')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Quick search' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Search all content' })).toBeFocused();
});

test('creates a course with its first lesson', async ({ page }) => {
  await openSeededDashboard(page);
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  await page.getByRole('textbox', { name: 'Course name' }).fill('Browser smoke course');
  await page.getByRole('radio', { name: /Steady retention/ }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lesson 1' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Course sections' })).toBeVisible();
});

test('keeps the New Course calendar visible and focused', async ({ page }) => {
  await openSeededDashboard(page);
  await page.locator('main').getByRole('button', { name: 'New course' }).click();
  await page.getByRole('radio', { name: /Exam date/ }).click();
  await page.getByRole('button', { name: 'Exam date and time' }).click();

  const calendar = page.getByRole('dialog', { name: 'Choose date and time' });
  await expect(calendar).toBeVisible();
  await expect(calendar).not.toHaveAttribute('aria-modal');
  await expect(calendar.locator('[aria-current="date"]')).toBeFocused();

  const containment = await calendar.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const clippingAncestors: string[] = [];
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (
        ['hidden', 'clip'].includes(style.overflow) ||
        ['hidden', 'clip'].includes(style.overflowX) ||
        ['hidden', 'clip'].includes(style.overflowY)
      ) {
        clippingAncestors.push(parent.tagName);
      }
    }
    return {
      clippingAncestors,
      insideViewport:
        bounds.top >= 0 &&
        bounds.left >= 0 &&
        bounds.right <= window.innerWidth &&
        bounds.bottom <= window.innerHeight,
    };
  });

  expect(containment).toEqual({ clippingAncestors: [], insideViewport: true });
});

test('opens a lesson with persistent course navigation', async ({ page }) => {
  await openSeededDashboard(page);
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Core concepts & rendering' }).click();
  const navigation = page.getByRole('navigation', { name: 'Course sections' });
  await expect(navigation.getByRole('link', { name: 'Path' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Cards' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Questions' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Analytics' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Settings' })).toBeVisible();
});

test('starts a real lesson study interaction', async ({ page }) => {
  await openSeededDashboard(page);
  await page.getByText('Welcome to Lacuna', { exact: true }).first().click();
  // Exact, because the dashboard also carries "Study Choose a course" and a per-course
  // "Study <name>" control. Without it, strict mode matches all three.
  await page.getByRole('button', { name: 'Study', exact: true }).click();
  await page
    .getByRole('button', { name: /Start:|Continue:/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page
    .getByRole('button', { name: /Show answer/i })
    .last()
    .click();
  const card = page.locator('[data-study-card-id]').first();
  const cardId = await card.getAttribute('data-study-card-id');
  expect(cardId).not.toBeNull();
  const initialCentre = await card.evaluate((surface) => {
    const bounds = surface.getBoundingClientRect();
    return bounds.left + bounds.width / 2;
  });
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(page.locator('[data-study-card-id]').first()).not.toHaveAttribute(
    'data-study-card-id',
    cardId ?? '',
  );
  await expect
    .poll(() => card.evaluate((surface, centre) => {
      const bounds = surface.getBoundingClientRect();
      return Math.abs(bounds.left + bounds.width / 2 - centre);
    }, initialCentre))
    .toBeLessThan(1);
  await expect(card).toHaveCSS('opacity', '1');
});

test('opens an archived course as read-only content', async ({ page }) => {
  await openSeededDashboard(page);
  const courseCard = page
    .locator('main')
    .getByRole('button', { name: /Exam in .* Welcome to Lacuna/ });

  await courseCard.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Archive' }).click();
  await page.getByRole('button', { name: 'Archive course' }).click();

  const courseNavigation = page.getByRole('navigation', { name: 'Courses' });
  await expect(courseNavigation.getByRole('link', { name: 'Archived' })).toBeVisible();
  await courseNavigation.getByRole('link', { name: 'Archived' }).click();
  await expect(page.getByRole('heading', { name: 'Archived' })).toBeVisible();

  const archivedCourse = page.getByRole('link', { name: 'Open Welcome to Lacuna' });
  await archivedCourse.focus();
  await expect(archivedCourse).toBeFocused();
  await archivedCourse.click();

  await expect(page.getByText('Archived course', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Archived courses' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Course sections' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Study', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Author mode' })).toHaveCount(0);

  const courseId = /#\/course\/([^/?]+)/.exec(page.url())?.[1];
  expect(courseId).toBeTruthy();
  const archivedLesson = page.getByRole('button', { name: 'Core concepts & rendering' });
  await archivedLesson.focus();
  await expect(archivedLesson).toBeFocused();
  await archivedLesson.press('Enter');
  await expect(page.getByRole('heading', { name: 'Core concepts & rendering' })).toBeVisible();
  await expect(page.locator('[data-lesson-workspace-mode="study"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Author mode' })).toHaveCount(0);

  await page.goto(`/#/course/${courseId}/cards`);
  await expect(page).toHaveURL(new RegExp(`#/course/${courseId}/?$`));
  await expect(page.getByRole('heading', { name: 'Curriculum' })).toBeVisible();
});

test('downloads a full backup from recovery settings', async ({ page }) => {
  await openSeededDashboard(page);
  await page.goto('/#/settings#settings-export');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Full backup Complete database' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^lacuna-backup-.*\.json$/);
});
