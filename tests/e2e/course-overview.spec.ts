import { expect, test } from '@playwright/test';
import { createCourse, enterWithWelcomeCourse } from './fixtures/lacunaApp';

for (const single of [true, false]) {
  test(`a ${single ? 'single' : 'multi'}-lesson ladder opens its real workspace and returns to the path`, async ({
    page,
  }) => {
    await enterWithWelcomeCourse(page);
    if (single) await createCourse(page, 'Biology', false);
    else
      await page
        .getByRole('region', { name: 'Today, most urgent first' })
        .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
        .click();
    const courseUrl = page.url();
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.keyboard.press('s');
    await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page
      .getByRole('button', { name: single ? 'Lesson 1' : 'Scheduling philosophy', exact: true })
      .click();
    await expect(page).toHaveURL(/\/lesson\//);
    await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(courseUrl);
    await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
    await page.goForward();
    await expect(page.locator('[data-lesson-workspace-mode]')).toBeVisible();
    await page.getByRole('link', { name: 'Path', exact: true }).click();
    await page.getByRole('button', { name: 'Edit mode' }).click();
    const add = page.getByRole('button', { name: 'Add', exact: true });
    await add.click();
    await page.getByRole('menuitem', { name: 'Lesson', exact: true }).click();
    await page.getByRole('textbox', { name: 'Lesson name' }).fill('Course overview regression');
    await page.getByRole('button', { name: 'Create lesson' }).click();
    await expect(page).toHaveURL(/\/lesson\//);
    await expect(
      page.getByRole('heading', { name: 'Course overview regression', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Path', exact: true }).click();
    await expect(page).toHaveURL(courseUrl);
    await expect(
      page.getByRole('button', { name: 'Course overview regression', exact: true }),
    ).toBeVisible();
  });
}

test('narrow-screen keyboard activation opens the focused lesson', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  const stop = page.getByRole('button', { name: 'Scheduling philosophy', exact: true });
  await stop.focus();
  await stop.press('Enter');
  await expect(page).toHaveURL(/\/lesson\//);
  await expect(
    page.getByRole('heading', { name: 'Scheduling philosophy', exact: true }),
  ).toBeVisible();
});

test('practice editing keeps an unobstructed 44px touch target with a long name', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await enterWithWelcomeCourse(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Card practice', exact: true }).click();
  const name = 'Practice with a long name covering several lines';
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const actions = page.getByRole('button', { name: `Practice actions: ${name}`, exact: true });
  await expect(actions).toBeVisible();
  await actions.scrollIntoViewIfNeeded();
  const bounds = await actions.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44);
  expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const row = actions.locator('xpath=ancestor::li[1]');
  const previous = await row.locator('xpath=preceding-sibling::li[1]').boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(previous!.y + previous!.height);
  await actions.click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue(name);
});

test.describe('course loading motion', () => {
  test.use({ serviceWorkers: 'block' });
  for (const reduced of [false, true]) {
    test(`course loading hands off in reading order with ${reduced ? 'reduced' : 'normal'} motion`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1470, height: 956 });
      await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/assets/CoursePath-*.js', async (route) => {
        await held;
        await route.continue();
      });
      await enterWithWelcomeCourse(page);
      await page.evaluate(() => {
        type Sample = { loading: number[] | null; content: number[] | null };
        const capture = window as typeof window & { arrivalFrames: Sample[]; stopArrival: boolean };
        capture.arrivalFrames = [];
        capture.stopArrival = false;
        const opacity = (element: Element | null) => {
          if (!element) return 0;
          let result = 1;
          for (let node: Element | null = element; node; node = node.parentElement) {
            const style = getComputedStyle(node);
            if (style.display === 'none' || style.visibility === 'hidden') return 0;
            result *= Number(style.opacity);
          }
          return result;
        };
        const sample = () => {
          const loading = document.querySelector('[role="status"][aria-label="Loading page"]');
          const heading = [...document.querySelectorAll('h1')].find(
            (h) => h.textContent === 'Welcome to Lacuna',
          );
          const path = document.querySelector('[aria-label="Course path"]')?.closest('section');
          const summary = document.querySelector('[aria-label="Course summary"]');
          capture.arrivalFrames.push({
            loading: loading
              ? [
                  opacity(loading.querySelector('header')),
                  ...[...loading.querySelectorAll('section')].slice(0, 2).map(opacity),
                ]
              : null,
            content:
              heading && path && summary
                ? [opacity(heading), opacity(path), opacity(summary)]
                : null,
          });
          if (!capture.stopArrival) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      try {
        await page
          .getByRole('navigation', { name: 'Courses', exact: true })
          .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
          .click();
        await expect(page.getByRole('status', { name: 'Loading page' })).toBeVisible();
        // Hold only the real route chunk. The loader owns its ordinary visibility clock.
        await page.waitForFunction(() => {
          const frames = (
            window as typeof window & { arrivalFrames: { loading: number[] | null }[] }
          ).arrivalFrames;
          return frames.some(
            ({ loading }) => loading && loading.length === 3 && loading.every((v) => v > 0.95),
          );
        });
      } finally {
        release();
      }
      await expect(page.getByRole('list', { name: 'Course path' })).toBeVisible();
      const study = page.getByRole('button', { name: 'Study', exact: true });
      await study.focus();
      await study.press('Enter');
      await expect(page.getByRole('region', { name: 'Session preview' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('status', { name: 'Loading page' })).toHaveCount(0);
      await page.waitForFunction(() => {
        const frames = (window as typeof window & { arrivalFrames: { content: number[] | null }[] })
          .arrivalFrames;
        return frames.some(({ content }) => content && content.every((v) => v > 0.99));
      });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const preferenceStart = await page.evaluate(
        () => (window as typeof window & { arrivalFrames: unknown[] }).arrivalFrames.length,
      );
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      const frames = await page.evaluate(() => {
        const capture = window as typeof window & {
          arrivalFrames: { loading: number[] | null; content: number[] | null }[];
          stopArrival: boolean;
        };
        capture.stopArrival = true;
        return capture.arrivalFrames;
      });
      expect(
        frames
          .slice(preferenceStart)
          .every(({ content }) => !content || content.every((opacity) => opacity === 1)),
        'changing motion preferences must not blank a settled page',
      ).toBe(true);
      if (reduced) {
        expect(frames.filter((f) => f.loading).every((f) => f.loading!.every((v) => v === 1))).toBe(
          true,
        );
      } else {
        for (const phase of ['loading', 'content'] as const) {
          expect(
            frames.some((f) => {
              const values = f[phase];
              return values && values[0] > values[1] + 0.02 && values[1] > values[2] + 0.02;
            }),
            `${phase} should reveal the heading before the path, then the summary`,
          ).toBe(true);
        }
      }
      await page.getByRole('button', { name: 'Scheduling philosophy', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Scheduling philosophy', exact: true }),
      ).toBeVisible();
    });
  }
});
