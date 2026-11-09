import { expect, test } from '@playwright/test';
import { settle } from './fixtures/flowEvidence';
import { enterFreshLacuna } from './fixtures/lacunaApp';

test.use({
  viewport: { width: 1470, height: 956 },
  deviceScaleFactor: 2,
  serviceWorkers: 'block',
  video: 'on',
});

for (const { reducedMotion, height } of [
  { reducedMotion: 'no-preference', height: 956 },
  { reducedMotion: 'reduce', height: 956 },
  { reducedMotion: 'no-preference', height: 600 },
] as const) {
  test(`subject expansion keeps the library frame and row widths steady (${reducedMotion}, ${height}px)`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1470, height });
    await page.emulateMedia({ reducedMotion });
    await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    await page.getByRole('button', { name: 'Course library', exact: true }).click();
    const subjects = page.getByRole('list', { name: 'Library subjects', exact: true });
    const biology = subjects.getByRole('button', { name: /^Biology \d+ courses$/ });
    await expect(biology).toBeVisible();
    // Finish entry before isolating the subject disclosure's motion.
    await settle(page.locator('.flow-expansion').filter({ has: subjects }));
    const outerOverflow = await subjects.evaluate((list) => {
      const scroller = list.closest<HTMLElement>('.overflow-y-auto')!;
      return scroller.scrollHeight - scroller.clientHeight;
    });
    expect(outerOverflow, 'the library must not add a second scroller').toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath('library-subjects.png') });

    for (const expanded of [true, false]) {
      const frames = await biology.evaluate(async (button) => {
        const list = button.closest('ul')!;
        const surface = button.closest('.flow-expansion')!;
        const sample = () => {
          const { top, height } = surface.getBoundingClientRect();
          return {
            top,
            height,
            rowWidth: button.getBoundingClientRect().width,
            gutter: list.getBoundingClientRect().width - list.clientWidth,
          };
        };
        const frames = [sample()];
        (button as HTMLButtonElement).click();
        const started = performance.now();
        await new Promise<void>((resolve) => {
          const frame = () => {
            frames.push(sample());
            if (performance.now() - started < 800) requestAnimationFrame(frame);
            else resolve();
          };
          requestAnimationFrame(frame);
        });
        return frames;
      });
      await info.attach(`subject-${expanded ? 'expanded' : 'collapsed'}-frames`, {
        body: JSON.stringify(frames),
        contentType: 'application/json',
      });
      if (expanded) await page.screenshot({ path: info.outputPath('library-biology.png') });
      await expect(biology).toHaveAttribute('aria-expanded', String(expanded));
      const range = (key: 'top' | 'height' | 'rowWidth') =>
        Math.max(...frames.map((frame) => frame[key])) -
        Math.min(...frames.map((frame) => frame[key]));
      expect(
        range('height'),
        'subject expansion must not resize the surrounding panel',
      ).toBeLessThan(1);
      expect(range('top'), 'the panel must stay anchored').toBeLessThan(1);
      expect(range('rowWidth'), 'a scrollbar must not squeeze the rows').toBeLessThan(1);
      expect(Math.max(...frames.map((frame) => frame.gutter))).toBeLessThan(1);
    }

    await biology.click();
    await page.waitForTimeout(800);
    const courses = page.getByRole('list', { name: 'Biology courses', exact: true });
    const lastCourse = courses.getByRole('button').last();
    await biology.focus();
    for (let index = 0; index < (await courses.getByRole('button').count()); index++) {
      await page.keyboard.press('Tab');
    }
    await expect(lastCourse).toBeFocused();
    await expect(lastCourse).toBeInViewport({ ratio: 1 });

    await page.getByRole('searchbox', { name: 'Search the course library' }).fill('no-such-course');
    const status = page.getByRole('status').filter({ hasText: 'No library course matches.' });
    await expect(status).toBeInViewport({ ratio: 1 });
    const gap = await status.evaluate((element) => {
      const search = document.querySelector('#import-library-search')!;
      return element.getBoundingClientRect().top - search.getBoundingClientRect().bottom;
    });
    expect(gap, 'empty search feedback must not follow a blank results viewport').toBeLessThan(120);
  });
}

test('keeps the library coherent through a cold download and backtracking', async ({ page }) => {
  let release: () => void = () => {};
  const download = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/assets/CourseLibraryImport-*.js', async (route) => {
    await download;
    await route.continue();
  });
  try {
    await enterFreshLacuna(page);
    await page.locator('main').getByRole('button', { name: 'New course', exact: true }).click();
    const name = page.getByRole('textbox', { name: 'Course name' });
    const library = page.getByRole('button', { name: 'Course library', exact: true });
    await name.fill('Unfinished chemistry');
    await library.click();
    const back = page.getByRole('button', { name: 'Back to New course' });
    await expect(back).toBeEnabled();
    await expect(page.getByLabel('Loading the course library', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Back to New course' }).press('Escape');
    await expect(library).toBeFocused();
    await expect(name).toHaveValue('Unfinished chemistry');

    await library.press('Enter');
    await expect(back).toBeFocused();
    release();
    const search = page.getByRole('searchbox', { name: 'Search the course library' });
    await expect(search).toBeFocused();
    const subjects = page.getByRole('list', { name: 'Library subjects', exact: true });
    await expect(subjects).toBeVisible();
    // Sample both edges in one frame while their shared parent is still moving.
    const [searchBounds, subjectsBounds] = await search.evaluate((input) => {
      const subjects = input.parentElement!.querySelector('[aria-label="Library subjects"]')!;
      return [input, subjects].map((element) => {
        const { x, width } = element.getBoundingClientRect();
        return { x, width };
      });
    });
    expect(Math.abs(searchBounds.x - subjectsBounds.x)).toBeLessThan(1);
    expect(Math.abs(searchBounds.width - subjectsBounds.width)).toBeLessThan(1);
    await search.fill('8461');
    await page.getByRole('button', { name: 'Biology AQA GCSE (8461)', exact: true }).click();
    await page.getByRole('button', { name: 'Back to the course library' }).press('Escape');
    await expect(search).toBeFocused();
    await expect(search).toHaveValue('8461');
  } finally {
    release();
  }
});
