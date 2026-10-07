import { expect, test } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

for (const height of [650, 900]) {
  test(`sidebar course and archive labels align without horizontal scrolling at ${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    const courses = page.getByRole('navigation', { name: 'Courses' });
    const course = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
    const archive = courses.getByRole('link', { name: 'Archived', exact: true });
    const name = course.getByText('Welcome to Lacuna', { exact: true });
    const archiveName = archive.getByText('Archived', { exact: true });
    expect(
      Math.abs((await name.boundingBox())!.x - (await archiveName.boundingBox())!.x),
    ).toBeLessThanOrEqual(1);
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
      ['/import', 'Import'],
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
  await enterFreshLacuna(page);
  await page.goto('/#/analytics');
  const strip = page.getByRole('grid', { name: 'Review activity over the last 30 days' });
  await expect(strip).toBeVisible();
  expect(
    await strip.evaluate((grid) => {
      const scroller = grid.parentElement!;
      return scroller.scrollWidth - scroller.clientWidth;
    }),
  ).toBeLessThanOrEqual(1);
  expect(
    await page.locator('main').evaluate((main) => main.scrollWidth - main.clientWidth),
  ).toBeLessThanOrEqual(1);
});

test('sidebar course names wrap to a second line instead of truncating', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const courses = page.getByRole('navigation', { name: 'Courses' });
  const link = courses.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  const name = link.getByText('Welcome to Lacuna', { exact: true });
  expect(
    await name.evaluate(
      (element) =>
        element.scrollWidth <= element.clientWidth && element.scrollHeight <= element.clientHeight,
    ),
  ).toBe(true);
  // The glyph already sets the row height, so the second line costs no space.
  expect((await link.boundingBox())!.height).toBeLessThanOrEqual(56);
  expect((await name.boundingBox())!.height).toBeGreaterThan(30);
});

test('card row actions meet the 44px target on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
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
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const course = new URL(page.url()).hash.slice(1);
  const short: string[] = [];
  for (const route of ['/', course, `${course}/settings`, '/settings', `${course}/cards/new`]) {
    await page.goto(`/#${route}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      const controls = document.querySelectorAll<HTMLElement>(
        'a[href], button, select, input:not([type=hidden]), [role=button], [role=switch]',
      );
      for (const el of controls) {
        if (el.closest('[inert], [aria-hidden=true], label') || el.matches(':disabled')) continue;
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

test('the study sheet is a bounded panel on a wide window', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await page.locator('main').getByRole('button', { name: /^Study/ }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Choose what to study' });
  await expect(sheet).toBeVisible();
  const panel = (await sheet.locator(':scope > div').last().boundingBox())!;
  expect(panel.width).toBeLessThanOrEqual(672);
  expect(Math.abs(panel.x + panel.width / 2 - 720)).toBeLessThanOrEqual(1);
  expect(panel.y + panel.height).toBeLessThan(900);
});

test('the course bar stays at the top while a course page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Settings', exact: true })
    .click();
  await expect(page).toHaveURL(/\/course\/[^/]+\/settings$/);
  const bar = page.locator('[data-course-page-navigation]');
  const main = page.locator('main');
  await main.evaluate((element) => element.scrollTo({ top: 900, behavior: 'instant' }));
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThanOrEqual(900);
  const y = (await bar.boundingBox())!.y;
  expect(y).toBeGreaterThanOrEqual(-1);
  expect(y).toBeLessThanOrEqual(1);
});

test('Today puts the study queue above the sharing announcement on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const queue = page.getByRole('region', { name: 'Today, most urgent first' });
  const banner = page.getByRole('region', { name: 'New sharing features' });
  await expect(banner).toBeVisible();
  const queueBox = (await queue.boundingBox())!;
  expect((await banner.boundingBox())!.y).toBeGreaterThanOrEqual(queueBox.y + queueBox.height);
  // The first course's Start is on the first screen.
  const start = (await queue.getByRole('button', { name: /^Start / }).first().boundingBox())!;
  expect(start.y + start.height).toBeLessThanOrEqual(844);
});
