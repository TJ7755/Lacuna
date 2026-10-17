import { expect, test } from '@playwright/test';

test('opening limits attention to the headline and one action', async ({ page }) => {
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'Your revision, built around your exam.',
  );
  await expect(hero.locator('p')).toHaveCount(0);
  await expect(hero.getByRole('button', { name: 'Pause illustrations' })).toHaveCount(1);
  await expect(hero.getByRole('link')).toHaveCount(2);
  await hero.getByRole('link', { name: 'Start revising' }).click();
  await expect(page).toHaveURL(/#\/$/);
});

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

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`wheel scrolling uses ${reducedMotion === 'reduce' ? 'native motion' : 'welcome inertia'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/#/landing');
    await expect(
      page.getByRole('heading', { name: 'Your revision, built around your exam.' }),
    ).toBeVisible();
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBe(reducedMotion === 'reduce' ? 400 : 340);
  });
}

test('opening offers keyboard app entry beside decorative artwork', async ({ page }) => {
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  const start = hero.getByRole('link', { name: 'Start revising' });
  await start.focus();
  await expect(start).toBeFocused();
  await expect(hero.locator('.revision-reel')).toHaveAttribute('aria-hidden', 'true');
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

test('welcome serves the approved landing and method shares its visual treatment', async ({
  page,
}) => {
  await page.goto('/#/welcome');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'The method' }).click();
  const method = page.locator('.method-page');
  await expect(method).toBeVisible();
  await expect(method).toHaveCSS('background-color', 'rgb(19, 25, 16)');
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

test('lower sections share the footer alignment', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/landing');
  await expect(page.locator('#how-it-works')).toBeVisible();
  const edges = await page.evaluate(() => {
    const left = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().left;
    return [left('#how-it-works .landing-feature-copy'), left('.landing-footer .landing-brand')];
  });
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
});
