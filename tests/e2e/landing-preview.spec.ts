import { expect, test } from '@playwright/test';

test('landing preview survives first launch and offers an unrestricted journey', async ({
  page,
}) => {
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
  await expect(page).toHaveURL(/#\/landing$/);
  await page.getByRole('link', { name: 'Skip to Lacuna' }).focus();
  await page.getByRole('link', { name: 'Skip to Lacuna' }).click();
  await expect(page.getByRole('heading', { name: 'Make room for remembering.' })).toBeInViewport();
  await page.getByRole('link', { name: 'Open Lacuna', exact: true }).last().click();
  await expect(page).toHaveURL(/#\/$/);
});

test('mobile reduced motion shows the complete story without horizontal overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
  await expect(page.getByText('You just can’t bring it back.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('native scrolling blurs then resolves the answer', async ({ page }) => {
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
  const answer = page.locator('.memory-answer');
  await expect(answer).toHaveCSS('filter', 'blur(0px)');
  await page.evaluate(() => {
    const scene = document.querySelector('.memory-sequence') as HTMLElement;
    window.scrollTo({ top: (scene.offsetHeight - innerHeight) * 0.61, behavior: 'instant' });
  });
  await expect(answer).toHaveCSS('filter', 'blur(23px)');
  await expect(page.locator('.memory-caption .memory-searching')).toHaveCSS('opacity', '1');
  await page.evaluate(() => {
    const scene = document.querySelector('.memory-sequence') as HTMLElement;
    window.scrollTo({ top: (scene.offsetHeight - innerHeight) * 0.96, behavior: 'instant' });
  });
  await expect(answer).toHaveCSS('filter', 'blur(0px)');
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`wheel scrolling uses ${reducedMotion === 'reduce' ? 'native motion' : 'welcome inertia'}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/#/landing');
    await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => page.evaluate(() => Math.round(window.scrollY)))
      .toBe(reducedMotion === 'reduce' ? 400 : 340);
  });
}

test('cinematic opening is quiet and lower sections share their alignment', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
  for (const caption of [
    'A familiar feeling.',
    'Revision, with your exam in mind.',
    'The word. The page. The feeling of knowing.',
    'Scroll to follow the thought',
    'Knowing → remembering',
  ]) {
    await expect(page.getByText(caption, { exact: true })).toHaveCount(0);
  }
  const edges = await page.evaluate(() => {
    const left = (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().left;
    return [
      left('.landing-product-intro'),
      left('.landing-walkthrough') +
        parseFloat(getComputedStyle(document.querySelector('.landing-walkthrough')!).paddingLeft),
      left('.landing-footer .landing-brand'),
    ];
  });
  expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
});

test('walkthrough pairs real screenshots with scrolling text and uses Instrument Sans', async ({
  page,
}) => {
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toHaveCSS(
    'font-family',
    /Instrument Sans/,
  );
  await expect(page.getByRole('heading', { name: 'Make room for remembering.' })).toHaveCSS(
    'font-family',
    /Instrument Sans/,
  );
  const walkthrough = page.getByRole('region', { name: 'Inside Lacuna' });
  await expect(walkthrough).toBeVisible();
  for (const name of [
    'See what needs your time.',
    'Follow your subject.',
    'Bring the answer back.',
  ]) {
    await page.getByRole('heading', { name, exact: true }).scrollIntoViewIfNeeded();
    await expect(walkthrough.locator('.walkthrough-frame img[data-active="true"]')).toHaveAttribute(
      'alt',
      name,
    );
  }
  expect(
    await walkthrough
      .locator('img')
      .evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true);
});

test('screenshot transitions track scroll in both directions', async ({ page }) => {
  await page.goto('/#/landing');
  await expect(page.getByRole('region', { name: 'Inside Lacuna' })).toBeVisible();
  const moveTo = async (fraction: number) => {
    await page.evaluate((value) => {
      const steps = [...document.querySelectorAll('.walkthrough-step')];
      const first = steps[0].getBoundingClientRect();
      const second = steps[1].getBoundingClientRect();
      window.scrollTo({
        top:
          scrollY +
          first.top +
          first.height / 2 -
          innerHeight / 2 +
          (second.top - first.top) * value,
        behavior: 'instant',
      });
    }, fraction);
  };
  const image = page.locator('.walkthrough-frame img').first();
  await moveTo(0);
  await expect(image).toHaveCSS('opacity', '1');
  await moveTo(0.5);
  await expect
    .poll(async () => Number(await image.evaluate((node) => getComputedStyle(node).opacity)))
    .toBeGreaterThan(0.35);
  await expect
    .poll(async () => Number(await image.evaluate((node) => getComputedStyle(node).opacity)))
    .toBeLessThan(0.65);
  await moveTo(1);
  await expect(image).toHaveCSS('opacity', '0');
  await moveTo(0);
  await expect(image).toHaveCSS('opacity', '1');
});

test('mobile walkthrough keeps each screenshot with its text', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/landing');
  await expect(page.getByRole('heading', { name: 'You remember learning it.' })).toBeVisible();
  await expect(page.locator('.walkthrough-frame')).toBeHidden();
  for (const step of await page.locator('.walkthrough-step').all()) {
    await step.scrollIntoViewIfNeeded();
    await expect(step.locator('img')).toBeVisible();
    await expect(step.locator('h3')).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('illustrated opening responds to pointer and keyboard', async ({ page }) => {
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await expect(hero).toBeVisible();
  await page.getByRole('button', { name: 'Your time.' }).hover();
  await expect(hero).toHaveAttribute('data-emphasis', 'time');
  await page.getByRole('button', { name: 'Your exam.' }).focus();
  await expect(hero).toHaveAttribute('data-emphasis', 'exam');
  await expect(page.getByRole('button', { name: 'Your exam.' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    hero.getByRole('img', {
      name: 'Lacuna dashboard showing the welcome course and daily revision',
    }),
  ).toBeVisible();
});

test('illustrated opening withdraws into memory and supports touch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/landing');
  const hero = page.getByRole('region', { name: 'Revision around your exam' });
  await page.getByRole('button', { name: 'Your exam.' }).click();
  await expect(hero).toHaveAttribute('data-emphasis', 'exam');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => {
    const scene = document.querySelector('.memory-sequence') as HTMLElement;
    window.scrollTo({ top: (scene.offsetHeight - innerHeight) * 0.3, behavior: 'instant' });
  });
  await expect(page.locator('.illustrated-opening')).toHaveAttribute('inert', '');
  await expect(page.locator('.memory-answer')).toHaveCSS('opacity', '1');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(hero).not.toHaveAttribute('inert', '');
});

test('footer offers app entry and the hero titles have equal emphasis', async ({ page }) => {
  await page.goto('/#/landing');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', '#/');
  const title = page.locator('.opening-title');
  expect(await title.evaluate((node) => getComputedStyle(node, '::after').content)).toBe('none');
  const colours = await title
    .locator('button')
    .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).color));
  expect(new Set(colours).size).toBe(1);
  await footer.getByRole('link', { name: 'Get started' }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('memory scene retains drawings after the dashboard leaves', async ({ page }) => {
  await page.goto('/#/landing');
  await expect(page.locator('.memory-drawing svg')).toHaveCount(1);
  await page.evaluate(() => {
    const scene = document.querySelector('.memory-sequence') as HTMLElement;
    window.scrollTo({ top: (scene.offsetHeight - innerHeight) * 0.3, behavior: 'instant' });
  });
  await expect(page.locator('.illustrated-opening')).toHaveAttribute('inert', '');
  await expect(page.locator('.memory-drawing')).toHaveCSS('opacity', '0.7');
});

test('welcome serves the approved landing and method shares its visual treatment', async ({
  page,
}) => {
  await page.goto('/#/welcome');
  await expect(page.getByRole('region', { name: 'Revision around your exam' })).toBeVisible();
  await page.getByRole('link', { name: 'The method' }).click();
  const method = page.locator('.method-page');
  await expect(method).toBeVisible();
  await expect(method).toHaveCSS('background-color', 'rgb(19, 18, 16)');
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
