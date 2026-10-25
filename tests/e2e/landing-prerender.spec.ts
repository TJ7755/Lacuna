import { expect, test } from '@playwright/test';

test('returning startup reveals the app and later welcome navigation', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lacuna-seeded', '1'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-app-starting');
  await page.evaluate(() => {
    window.location.hash = '#/welcome';
  });
  await expect(page.locator('.landing-page')).toBeVisible();
});

// The site root serves prerendered landing HTML. A first-visit browser hydrates
// it as a standalone entry, then hands over to the study app on navigation:
// the explicit entry reaches onboarding, not the welcome route again.
test('prerendered homepage hydrates and hands over to the study app', async ({ page }) => {
  await page.goto('/');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'Your revision, built around your exam.',
  );
  await hero.getByRole('link', { name: 'Start revising' }).click();
  // The handover honours the explicit entry instead of bouncing back to the
  // welcome route, and a new learner starts with onboarding.
  await expect(page).toHaveURL(/#\/start$/, { timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Show answer', exact: true }).last()).toBeVisible();
});

// A shared link to an in-page anchor is still a first visit: it must hydrate
// the landing page, not boot the study app. Only `#/` fragments are app routes.
test('a first visit to a landing anchor stays on the landing page', async ({ page }) => {
  await page.goto('/#how-it-works');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('link', { name: 'Start revising' })).toBeVisible();
  await expect(page).toHaveURL(/#how-it-works$/);
  await expect(page.getByRole('heading', { name: 'Courses' })).toHaveCount(0);
});
