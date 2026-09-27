import { expect, test } from '@playwright/test';

// The site root serves prerendered landing HTML. A first-visit browser hydrates
// it as a standalone entry, then hands over to the study app on navigation:
// the explicit entry reaches the seeded dashboard, not the welcome route again.
test(
  'prerendered homepage hydrates and hands over to the study app',
  async ({ page }) => {
    await page.goto('/');
    const hero = page.getByRole('region', { name: 'Revision around your exam' });
    await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
      'Your revision, built around your exam.',
    );
    await hero.getByRole('link', { name: 'Start revising' }).click();
    // Entering the app seeds the example course; the handover honours the
    // explicit entry instead of bouncing back to the welcome route.
    await expect(page).toHaveURL(/#\/$/, { timeout: 60000 });
    await expect(page.getByRole('heading', { name: 'Courses' })).toBeVisible();
  },
);
