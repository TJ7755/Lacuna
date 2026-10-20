import { expect, test } from '@playwright/test';
import { chooseScheduledStudy, createCourse, enterFreshLacuna } from './fixtures/lacunaApp';

for (const height of [650, 900]) {
  test(`sidebar course and archive glyphs align without horizontal scrolling at ${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const courses = page.getByRole('navigation', { name: 'Courses' });
    const course = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    const archive = courses.getByRole('link', { name: 'Archived', exact: true });
    const glyph = (await course.locator('svg').boundingBox())!;
    const archiveIcon = (await archive.locator('svg').boundingBox())!;
    expect(Math.abs(glyph.x + glyph.width / 2 - archiveIcon.x - archiveIcon.width / 2))
      .toBeLessThanOrEqual(1);
    expect(
      await courses.evaluate((element) => {
        const scroller = element.querySelector('.overflow-y-auto')!;
        return scroller.scrollWidth - scroller.clientWidth;
      }),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({ animations: 'disabled', path: test.info().outputPath('sidebar.png') });
  });
}

for (const width of [390, 1440]) {
  test(`walkthrough captures top-level pages without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await enterFreshLacuna(page);
    for (const [route, title] of [
      ['/', 'Today'],
      ['/share', 'Share'],
      ['/?import=1', 'Today'],
      ['/analytics', 'Progress'],
      ['/settings', 'Settings'],
      ['/help', 'Help'],
      ['/archived', 'Archived'],
    ] as const) {
      await page.goto(`/#${route}`);
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        animations: 'disabled',
        path: test.info().outputPath(`${title.toLowerCase()}.png`),
      });
    }
  });
}

test('Progress fits a phone, with today in view on the 30-day strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/analytics');
  const strip = page.getByRole('grid', { name: 'Review activity over the last 30 days' });
  await expect(strip).toBeVisible();
  await expect.poll(() => strip.evaluate((grid) => {
    const scroller = grid.parentElement!;
    return scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft;
  })).toBeLessThanOrEqual(1);
  const today = strip.getByRole('gridcell').last();
  await expect(today).toBeInViewport();
  const bounds = (await today.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(
    await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test('sidebar course names keep a single 44px row with the full accessible name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const courses = page.getByRole('navigation', { name: 'Courses' });
  const link = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  const name = link.getByText('Welcome to Lacuna', { exact: true });
  await expect(link).toHaveAccessibleName('Welcome to Lacuna');
  await expect(name).toHaveCSS('white-space', 'nowrap');
  await expect(name).toHaveCSS('overflow', 'hidden');
  expect((await link.locator('..').boundingBox())!.height).toBe(44);
  const label = (await name.boundingBox())!;
  const navigation = (await courses.boundingBox())!;
  expect(label.x + label.width).toBeLessThanOrEqual(navigation.x + navigation.width);
});

test('Today keeps New course and Import together beneath its counts on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const main = page.locator('main');
  const importer = main.getByRole('button', { name: 'Import', exact: true });
  await expect(importer).toBeVisible();
  const counts = (await main.getByLabel(/^Today: /).boundingBox())!;
  const create = (await main.getByRole('button', { name: 'New course' }).boundingBox())!;
  const importBounds = (await importer.boundingBox())!;
  expect(counts.y + counts.height).toBeLessThanOrEqual(create.y);
  expect(Math.abs(create.y - importBounds.y)).toBeLessThanOrEqual(1);
  expect(create.x + create.width).toBeLessThanOrEqual(importBounds.x);
  expect(importBounds.x + importBounds.width).toBeLessThanOrEqual(390);
  await importer.click();
  await expect(page.locator('.import-panel')).toBeVisible();
  await main.getByRole('button', { name: 'Close', exact: true }).click();
  // The navigation drawer reaches the same inline import surface.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Import' }).click();
  await expect(page).toHaveURL(/#\/\?import=1$/);
});

test('card row actions meet the 44px target on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.getByRole('link', { name: 'Cards', exact: true }).first().click();
  // A phone reaches a card's actions by opening the row, where they are full buttons.
  const row = page.locator('[data-card-id]').first();
  await row.click();
  for (const name of ['Edit', 'Flag']) {
    const button = row.getByRole('button', { name, exact: true });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
  }
  // And the question keeps the width: the hidden hover actions take none of it.
  const question = row.locator('[data-card-answer]');
  expect((await question.boundingBox())!.width).toBeGreaterThan(180);
});

test('controls on phone pages reach the 44px target', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const course = new URL(page.url()).hash.slice(1);
  const short: string[] = [];
  for (const route of ['/', course, `${course}/settings`, '/settings', `${course}/cards/new`]) {
    await page.goto(`/#${route}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    if (route.endsWith('/cards/new')) {
      // A saved tag returns as a suggestion beside a fresh chip, so both are probed.
      const tagField = page.getByRole('textbox', { name: 'Add tags' });
      await page.getByRole('textbox', { name: 'Front' }).fill('Target probe');
      await page.getByRole('textbox', { name: 'Back' }).fill('Answer');
      await tagField.fill('saved');
      await tagField.press('Enter');
      await page.getByRole('button', { name: 'Save & add another' }).click();
      await expect(page.getByRole('textbox', { name: 'Front' })).toHaveText('');
      // The next card keeps the tag; removing it turns the tag into a suggestion.
      await page.getByRole('button', { name: 'Remove saved' }).click();
      await tagField.fill('fresh');
      await tagField.press('Enter');
      await expect(page.getByRole('button', { name: 'Remove fresh' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'saved', exact: true })).toBeVisible();
    }
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>(
        'a[href], [role=link], button, select, input:not([type=hidden]), [role=button], [role=switch]',
      );
      for (const el of controls) {
        if (el.closest('[inert], [aria-hidden=true]') || el.matches(':disabled')) continue;
        // A radio or checkbox is operated through its label row, so that row is its target.
        const row = el.closest('label');
        if (row && el.matches('input[type=radio], input[type=checkbox]')) {
          const box = row.getBoundingClientRect();
          if (box.height && box.height < 43.5)
            out.push(`${location.hash} label ${Math.round(box.width)}x${Math.round(box.height)} ${row.textContent!.trim().slice(0, 40)}`);
          continue;
        }
        if (row) continue;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        // A visually hidden control (the skip link) is 1px until focused.
        if (r.width <= 1 || r.height <= 1 || getComputedStyle(el).visibility === 'hidden') continue;
        // Links within running text are exempt, as in WCAG 2.5.8.
        if (getComputedStyle(el).display === 'inline') continue;
        // Probe the hit area itself, so a pseudo-element that widens it counts.
        const hits = (x: number, y: number) => {
          const at = document.elementFromPoint(x, y);
          // A text field's whole box focuses it, so the box is its target.
          return !!at && (at === el || el.contains(at) || (at.contains(el) && at.matches('.cursor-text')));
        };
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        // 21 rather than 22 tolerates sub-pixel edges and a neighbour's sliding indicator.
        const ok = hits(cx - 21, cy) && hits(cx + 21, cy) && hits(cx, cy - 21) && hits(cx, cy + 21);
        if (!ok) {
          const name = el.getAttribute('aria-label') || el.title || el.textContent || el.tagName;
          out.push(`${location.hash} ${Math.round(r.width)}x${Math.round(r.height)} ${name.trim().slice(0, 40)}`);
        }
      }
      return out;
    });
    short.push(...found);
  }
  expect(short).toEqual([]);
});

test('the session preview stays bounded beside its Study trigger on a wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true }).click();
  const study = page.locator('main').getByRole('button', { name: 'Study', exact: true });
  const anchor = (await study.boundingBox())!;
  await study.click();
  const preview = page.getByRole('region', { name: 'Session preview' });
  await expect(preview).toBeVisible();
  const panel = (await preview.boundingBox())!;
  expect(panel.width).toBeLessThanOrEqual(448);
  expect(Math.abs(panel.x + panel.width - anchor.x - anchor.width)).toBeLessThanOrEqual(1);
  expect(panel.x).toBeGreaterThanOrEqual(16);
  expect(panel.y).toBeGreaterThanOrEqual(16);
  expect(panel.y + panel.height).toBeLessThanOrEqual(884);
});

test('the course bar stays at the top while a course page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: 'Welcome to Lacuna', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(page).toHaveURL(/\/course\/[^/]+\/settings$/);
  const bar = page.locator('[data-course-page-navigation]');
  // Settings loads after the URL changes; scrolling an unloaded page has nowhere to go.
  await expect(page.locator('#course-settings-study')).toBeVisible();
  await page.getByRole('button', { name: /^Lessons / }).click();
  const main = page.locator('main');
  await main.evaluate((element) => element.scrollTo({ top: 900, behavior: 'instant' }));
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(900);
  const y = (await bar.boundingBox())!.y;
  expect(y).toBeGreaterThanOrEqual(-1);
  expect(y).toBeLessThanOrEqual(1);
});

test('Today keeps Study on the first phone screen without a sharing announcement', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const queue = page.getByRole('region', { name: 'Today, most urgent first' });
  await expect(queue).toBeVisible();
  await expect(page.getByRole('region', { name: 'New sharing features' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Explore sharing/ })).toHaveCount(0);
  // The first course's Study is on the first screen.
  const start = (await queue.getByRole('button', { name: /^Study / }).first().boundingBox())!;
  expect(start.y + start.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: testInfo.outputPath('today-first-phone-screen.png') });
});

for (const width of [390, 1280]) {
  test(`top-level page titles share one height at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    // A second course gives Share its course picker beside the title.
    await createCourse(page, 'Chemistry');
    await page.setViewportSize({ width, height: 900 });
    const heights: Record<string, number> = {};
    for (const [route, name] of [
      ['/settings', 'Settings'],
      ['/analytics', 'Progress'],
      ['/share', 'Share'],
      ['/help', 'Help'],
    ]) {
      await page.goto(`/#${route}`);
      const title = page.getByRole('heading', { level: 1, name, exact: true });
      await expect(title).toBeVisible();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      heights[name] = Math.round((await title.boundingBox())!.y);
    }
    expect(new Set(Object.values(heights)).size, JSON.stringify(heights)).toBe(1);
  });
}

for (const width of [390, 1280]) {
  test(`the timer keeps its place as a study step ends at ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page.getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: /^Study Welcome to Lacuna/ }).click();
    await chooseScheduledStudy(page);
    const timer = page.getByRole('button', { name: 'Pomodoro timer' });
    const progress = page.getByRole('main', { name: 'Study progress' });
    let inLearn: { x: number; y: number } | null = null;
    for (let step = 0; step < 80 && !(await progress.isVisible()); step++) {
      const reveal = page.getByRole('button', { name: /Show answer/i }).last();
      if (await reveal.isVisible()) {
        inLearn ??= (await timer.boundingBox())!;
        await reveal.click();
        continue;
      }
      for (const name of ['Yes', 'Good', 'Continue']) {
        const button = page.getByRole('button', { name, exact: true }).last();
        if (await button.isVisible()) {
          await button.click();
          break;
        }
      }
      await page.waitForTimeout(150);
    }
    await expect(progress).toBeVisible();
    const between = (await timer.boundingBox())!;
    expect(inLearn).not.toBeNull();
    expect(Math.abs(between.x - inLearn!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(between.y - inLearn!.y)).toBeLessThanOrEqual(1);
  });
}
