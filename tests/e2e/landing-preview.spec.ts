import { expect, test } from '@playwright/test';

test('landing survives first launch and offers an unrestricted journey', async ({ page }) => {
  await page.goto('/#/landing');
  await expect(
    page.getByRole('heading', { name: 'Your revision, built around your exam.' }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/landing$/);
  await page.getByRole('link', { name: 'Skip to Lacuna' }).focus();
  await page.getByRole('link', { name: 'Skip to Lacuna' }).click();
  await expect(
    page.getByRole('heading', { name: 'Scheduled for your exam, not for ever.' }),
  ).toBeInViewport();
  await page.getByRole('link', { name: 'Start revising', exact: true }).last().click();
  await expect(page).toHaveURL(/#\/$/);
});

test('closing section offers app entry', async ({ page }) => {
  await page.goto('/#/landing');
  const footer = page.getByRole('region', { name: 'Your exam has a date. Start there.' });
  await expect(footer.getByRole('link', { name: 'Start revising' })).toHaveAttribute('href', '#/');
  const title = page.locator('.motion-opening h1');
  expect(await title.evaluate((node) => getComputedStyle(node, '::after').content)).toBe('none');
  await footer.getByRole('link', { name: 'Start revising' }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('welcome serves the approved landing and method follows the app theme', async ({ page }) => {
  await page.goto('/#/welcome');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'The method' }).click();
  const method = page.locator('.method-page');
  await expect(method).toBeVisible();
  const paper = await page.evaluate(() => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = 'hsl(var(--paper))';
    document.body.append(probe);
    const colour = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return colour;
  });
  await expect(method).toHaveCSS('background-color', paper);
  await expect(
    page.getByRole('heading', { name: 'The thinking behind remembering.' }),
  ).toBeVisible();
  const slider = page.getByRole('slider', { name: 'Weighted sum z' });
  await slider.scrollIntoViewIfNeeded();
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuenow', '1.7');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .getByRole('navigation', { name: 'Method navigation' })
    .getByRole('link', { name: 'Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/welcome$/);
});

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`landing app entry keeps its label and honours ${motion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/#/welcome');
    await expect(
      page.getByRole('contentinfo').getByRole('link', { name: 'GitHub' }),
    ).toHaveAttribute('href', 'https://github.com/TJ7755/Lacuna');
    await expect(page.getByRole('heading', { name: 'Yours, on your device.' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /reduced motion/i })).toHaveCount(0);
    const cta = page
      .getByRole('region', { name: 'Revision around your exam' })
      .getByRole('link', { name: 'Start revising' });
    await cta.hover();
    await expect(cta.locator('.landing-cta-label')).toHaveCSS('opacity', '1');
    await cta.click();
    const overlay = page.locator('[data-landing-transition]');
    if (motion === 'no-preference') await expect(overlay).toBeVisible();
    else await expect(overlay).toHaveCount(0);
    await expect(page).toHaveURL(/#\/$/);
    await expect(overlay).toHaveCount(0);
  });
}

test('opening stays independent from the lower sections and supports touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('link', { name: 'Start revising' })).toBeInViewport();
  await expect(hero.getByRole('heading')).toHaveText('Your revision, built around your exam.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#landing-grading').scrollIntoViewIfNeeded();
  await expect(hero).not.toHaveAttribute('inert', '');
  await expect(hero.getByRole('heading')).toHaveText('Your revision, built around your exam.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).not.toHaveAttribute('inert', '');
});
