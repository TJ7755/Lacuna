import { expect, test } from '@playwright/test';

test('exam projection responds to review timing while the exam stays fixed', async ({ page }) => {
  await page.goto('/#/welcome');
  const section = page.getByRole('region', { name: 'Remember it on exam day.' });
  await section.scrollIntoViewIfNeeded();
  const timing = section.getByRole('slider', { name: 'Next review' });
  const projection = section.locator('output');
  const before = await projection.textContent();
  const curve = section.locator('.exam-curve-reviewed');
  const beforeCurve = await curve.getAttribute('d');
  const exam = section.locator('.exam-curve-deadline');
  const examX = await exam.getAttribute('x1');
  await timing.fill('6');
  await expect(projection).not.toHaveText(before!);
  expect(await curve.getAttribute('d')).not.toBe(beforeCurve);
  await expect(exam).toHaveAttribute('x1', examX!);
  for (const progress of [0.15, 0.85, 0.15]) {
    await section.evaluate((element, amount) => {
      const rect = element.getBoundingClientRect();
      window.scrollTo({ top: scrollY + rect.top + (rect.height - innerHeight) * amount, behavior: 'instant' });
    }, progress);
    await expect.poll(async () => Number(await section.evaluate((element) =>
      getComputedStyle(element).getPropertyValue('--curve-progress'),
    ))).toBeCloseTo(progress, 2);
    await expect.poll(async () => Number((await curve.evaluate((element) =>
      getComputedStyle(element).strokeDashoffset,
    )).match(/^calc\(([-\d.]+)px\)$/)?.[1])).toBeCloseTo(1 - progress, 2);
  }
  await timing.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(timing).toHaveValue('5');
  await expect(section.getByText(/assuming successful reviews/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await section.scrollIntoViewIfNeeded();
  await expect(timing).toBeVisible();
  await expect(curve).toHaveCSS('stroke-dashoffset', '0px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

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

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`landing app entry keeps its label and honours ${motion}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: motion });
    await page.goto('/#/welcome');
    const nav = page.getByRole('navigation', { name: 'Landing navigation' });
    await expect(nav.getByRole('link', { name: 'GitHub' })).toHaveAttribute(
      'href',
      'https://github.com/TJ7755/Lacuna',
    );
    await expect(page.getByRole('heading', { name: '£0 forever.' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: /reduced motion/i })).toHaveCount(0);
    const cta = nav.getByRole('link', { name: 'Open Lacuna' });
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

test('closing scenes separate the copy and doodles as scrolling reverses', async ({ page }) => {
  await page.goto('/#/welcome');
  await expect(
    page.getByRole('heading', { name: 'Your study data stays on your device.' }),
  ).toBeVisible();
  const scene = page.locator('.closing-scene').first();
  const copy = scene.locator('.closing-copy');
  const drawings = scene.locator('.closing-drawings');
  const scrollToProgress = async (progress: number) => {
    await scene.evaluate((node, progress) => {
      window.scrollTo({
        top:
          window.scrollY +
          node.getBoundingClientRect().top +
          (node.clientHeight - innerHeight) * progress,
        behavior: 'instant',
      });
    }, progress);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
  };
  await scrollToProgress(0);
  await expect
    .poll(() => copy.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe('none');
  const initial = await copy.evaluate((node) => getComputedStyle(node).transform);
  await scrollToProgress(1);
  await expect
    .poll(() => copy.evaluate((node) => getComputedStyle(node).transform))
    .not.toBe(initial);
  expect(await drawings.evaluate((node) => getComputedStyle(node).transform)).not.toBe(
    await copy.evaluate((node) => getComputedStyle(node).transform),
  );
  await scrollToProgress(0);
  await expect.poll(() => copy.evaluate((node) => getComputedStyle(node).transform)).toBe(initial);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(copy).toHaveCSS('transform', 'none');
  await expect(drawings).toHaveCSS('transform', 'none');
});

test('walkthrough explains exam scheduling, time limits and application practice before pricing', async ({
  page,
}) => {
  await page.goto('/#/welcome');
  await expect(page.locator('.opening-description')).toHaveText(
    'Spaced revision that schedules for your exam day.',
  );
  const walkthrough = page.getByRole('region', { name: 'Inside Lacuna' });
  for (const name of [
    'Schedule for the day it matters.',
    'Fit revision into your day.',
    'Practise using what you know.',
  ]) {
    const heading = walkthrough.getByRole('heading', { name, exact: true });
    await heading.scrollIntoViewIfNeeded();
    await expect(walkthrough.locator('.walkthrough-frame img[data-active="true"]')).toHaveAttribute(
      'alt',
      name,
    );
  }
  expect(
    await page.evaluate(
      () =>
        document.querySelector('.landing-walkthrough')!.getBoundingClientRect().bottom <=
        document.querySelector('.closing-scene')!.getBoundingClientRect().top,
    ),
  ).toBe(true);
});

test('course journey follows scrolling forwards and backwards without buttons', async ({
  page,
}) => {
  await page.goto('/#/welcome');
  const journey = page.getByRole('region', { name: 'A course, one step at a time.' });
  await expect(journey.locator('button')).toHaveCount(0);
  for (const index of [0, 1, 2, 3, 1]) {
    await journey.locator('.journey-example').nth(index).scrollIntoViewIfNeeded();
    await expect(journey.locator('.journey-stop').nth(index)).toHaveAttribute(
      'data-active',
      'true',
    );
  }
  await expect(
    journey.getByText('The rate at which something changes.', { exact: true }),
  ).toBeVisible();
  const recall = journey.locator('.journey-example').nth(1);
  const answer = recall.locator('.journey-answer');
  const turn = recall.locator('.journey-card-turn');
  await expect(turn).toHaveCount(1);
  for (const [offset, rotation] of [
    [-0.2, 1],
    [0.2, -1],
    [-0.2, 1],
  ] as const) {
    await recall.evaluate(
      (node, offset) =>
        window.scrollTo({
          top: scrollY + node.getBoundingClientRect().top + innerHeight * offset,
          behavior: 'instant',
        }),
      offset,
    );
    await expect
      .poll(() => turn.evaluate((node) => new DOMMatrix(getComputedStyle(node).transform).m11))
      .toBeCloseTo(rotation, 3);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(turn).toHaveCSS('transform', 'none');
  await expect(answer).toHaveCSS('transform', 'none');
  await expect(answer).toHaveCSS('opacity', '1');
  for (const title of [
    'Start with the idea.',
    'Bring it back to mind.',
    'Put it to work.',
    'A date to work towards.',
  ]) {
    await expect(journey.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
