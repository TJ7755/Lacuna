import { expect, test } from '@playwright/test';

test('the hero mark hands over to the centred fixed header when scrolling', async ({ page }) => {
  await page.goto('/#/landing?variant=motion');
  const nav = page.getByRole('navigation', { name: 'Landing navigation' });
  await expect(nav).toHaveCSS('position', 'fixed');
  const brand = nav.locator('.landing-brand');
  await expect(brand).toHaveCSS('opacity', '1');
  const mark = nav.locator('.motion-nav-mark');
  await expect(mark).toHaveCSS('opacity', '0');
  await page.getByRole('region', { name: 'Ready to make it stick?' }).scrollIntoViewIfNeeded();
  await expect(mark).toHaveCSS('opacity', '1');
  await expect(brand).toHaveCSS('opacity', '0');
  await expect(brand).toHaveAttribute('tabindex', '-1');
  await expect(nav).toBeInViewport();
  const box = await mark.boundingBox();
  expect(box!.x + box!.width / 2).toBeCloseTo((await page.evaluate(() => innerWidth)) / 2, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(mark).toHaveCSS('transition-property', 'none');
  await expect(nav.getByRole('link', { name: 'Download for desktop' })).toBeInViewport();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await expect(mark).toHaveCSS('opacity', '0');
  await expect(brand).toHaveCSS('opacity', '1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('motion prototype keeps a stable promise, accessible motion control and direct entry', async ({
  page,
}) => {
  await page.goto('/#/landing?variant=motion');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero.getByRole('heading', { level: 1 })).toHaveText(
    'Your revision, built around your exam.',
  );
  const reel = hero.locator('.revision-reel');
  await expect(reel).toHaveAttribute('aria-hidden', 'true');
  await expect(reel.locator('.revision-object')).toHaveCount(12);
  const tile = reel.locator('.revision-object').first();
  const before = await tile.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => tile.evaluate((el) => getComputedStyle(el).transform)).not.toBe(before);
  await page.getByRole('button', { name: 'Pause illustrations' }).click();
  await expect(tile).toHaveCSS('animation-play-state', 'paused');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(tile).toHaveCSS('animation-name', 'none');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(hero.getByRole('link', { name: 'Start revising' })).toBeInViewport();
  await hero.getByRole('link', { name: 'See how it works' }).click();
  await expect(page.getByRole('heading', { name: 'Your time. Your pace.' })).toBeInViewport();
  await hero.getByRole('link', { name: 'Start revising' }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('exam introduction presents one idea at a time without subtitles', async ({ page }) => {
  await page.goto('/#/landing?variant=motion');
  const scene = page.locator('#landing-product');
  await expect(scene.locator('p, svg text')).toHaveCount(0);
  expect(
    await page.locator('main').evaluate((main) => {
      const sections = [...main.children];
      return (
        sections[1].id === 'landing-product' &&
        sections[2].classList.contains('landing-walkthrough')
      );
    }),
  ).toBe(true);
  const time = scene.locator('.exam-fit-time-beat');
  const exam = scene.locator('.exam-fit-exam-beat');
  const scrollTo = async (progress: number) => {
    await scene.evaluate(
      (el, value) =>
        window.scrollTo({
          top: scrollY + el.getBoundingClientRect().top + (el.clientHeight - innerHeight) * value,
          behavior: 'instant',
        }),
      progress,
    );
  };
  for (const progress of [0, 0.3, 0.5, 0.7, 1, 0]) {
    await scrollTo(progress);
    await expect
      .poll(() => scene.evaluate((el) => Number(getComputedStyle(el).getPropertyValue('--fit'))))
      .toBeCloseTo(progress, 2);
    const opacity = await scene.evaluate((el) =>
      [...el.querySelectorAll('.exam-fit-beat')].map((beat) =>
        Number(getComputedStyle(beat).opacity),
      ),
    );
    expect(opacity.filter((value) => value > 0.01).length).toBeLessThanOrEqual(1);
    if (progress === 0) {
      await expect(time).toHaveCSS('opacity', '1');
      await expect(exam).toHaveAttribute('aria-hidden', 'true');
    }
    if (progress === 1) {
      await expect(exam).toHaveCSS('opacity', '1');
      await expect(time).toHaveAttribute('aria-hidden', 'true');
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await scene.scrollIntoViewIfNeeded();
  await expect(scene.locator('.exam-fit-stage')).toHaveCSS('position', 'relative');
  await expect(time).toHaveCSS('opacity', '1');
  await expect(exam).toHaveCSS('opacity', '1');
  await expect(scene.getByRole('heading')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('prototype ends with a clear choice to start or download', async ({ page }) => {
  await page.goto('/#/landing?variant=motion');
  const ending = page.getByRole('region', { name: 'Ready to make it stick?' });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending.getByRole('heading')).toBeInViewport();
  await expect(ending.getByRole('link', { name: 'Start revising' })).toHaveAttribute('href', '#/');
  await expect(ending.getByRole('link', { name: 'Download for desktop' })).toHaveAttribute(
    'href',
    '#/download',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await ending.scrollIntoViewIfNeeded();
  await expect(ending.getByRole('link', { name: 'Download for desktop' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await ending.getByRole('link', { name: 'Start revising' }).click();
  await expect(page).toHaveURL(/#\/$/);
});
