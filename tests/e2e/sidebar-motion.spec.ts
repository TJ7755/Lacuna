import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

/** Gets past the first-run landing page; the shared fixture's landing heading is stale. */
async function enterFreshLacuna(page: Page) {
  await page.goto('/');
  await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

test.use({ trace: { mode: 'on', screenshots: false, snapshots: true } });

async function iconLeft(row: Locator) {
  return row
    .locator('svg')
    .first()
    .evaluate((icon) => icon.getBoundingClientRect().left);
}

for (const compact of [false, true]) {
  test(`sidebar icons stay anchored and labels stay mounted (compact: ${compact})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.addInitScript((compactMode) => {
      localStorage.setItem('lacuna.sidebarSettings', JSON.stringify({ compactMode }));
    }, compact);
    await enterFreshLacuna(page);
    const sidebar = page.getByRole('complementary');
    const names = [
      'Today',
      'Search content',
      'Progress',
      'Welcome to Lacuna',
      'Archived',
      'Share',
      'Settings',
      'Help',
    ];
    const rows = names.map((name) => sidebar.getByRole('link', { name, exact: true }));
    const controls = [
      sidebar.getByRole('button', { name: 'Toggle colour theme' }),
      sidebar.getByRole('button', { name: /^(Collapse|Expand) sidebar$/ }),
    ];
    // The collapse chevron changes slot by design; every other icon stays put.
    const icons = [...rows, controls[0]];
    const chevronBox = async () =>
      controls[1].locator('svg').evaluate((icon) => {
        const { left, top } = icon.getBoundingClientRect();
        return { left, top };
      });
    await expect(rows[3]).toBeVisible();
    await page.waitForTimeout(700);
    const before = await Promise.all(icons.map(iconLeft));
    const expandedChevron = await chevronBox();
    const themeTop = await controls[0]
      .locator('svg')
      .evaluate((icon) => icon.getBoundingClientRect().top);
    // Expanded: theme left, chevron right, on one row.
    expect(Math.abs(expandedChevron.top - themeTop)).toBeLessThanOrEqual(0.5);
    expect(expandedChevron.left).toBeGreaterThan(before[names.length]! + 100);
    const brand = page.getByTestId('sidebar-brand-mark');
    const brandLeft = (await brand.boundingBox())!.x;
    const labels = await Promise.all(
      rows.map((row, i) => row.getByText(names[i], { exact: true }).elementHandle()),
    );
    const wordmark = await sidebar.getByText('Lacuna', { exact: true }).elementHandle();
    const heading = await sidebar.getByText('Courses', { exact: true }).elementHandle();

    await controls[1].click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
    // These must be the original nodes, including the course's name and glyph.
    expect(
      await Promise.all(
        [...labels, wordmark, heading].map((label) => label!.evaluate((node) => node.isConnected)),
      ),
    ).toEqual(names.concat(['brand', 'heading']).map(() => true));
    const after = await Promise.all(icons.map(iconLeft));
    for (let i = 0; i < icons.length; i++)
      expect(Math.abs(after[i] - before[i]), [...names, 'Theme'][i]).toBeLessThanOrEqual(0.5);
    // Collapsed: the chevron stacks directly beneath the theme toggle, on the same axis.
    await expect
      .poll(async () => Math.abs((await chevronBox()).left - after[names.length]!))
      .toBeLessThanOrEqual(0.5);
    const collapsedChevron = await chevronBox();
    expect(collapsedChevron.top).toBeGreaterThan(themeTop + 40);
    expect(Math.abs((await brand.boundingBox())!.x - brandLeft)).toBeLessThanOrEqual(0.5);
    for (const row of rows) await expect(row).toHaveAccessibleName(new RegExp('.+'));
    for (let i = 0; i < rows.length; i++) {
      await rows[i].focus();
      await rows[i].hover();
      expect(
        Math.abs((await iconLeft(rows[i])) - before[i]),
        `${names[i]} after focus/hover`,
      ).toBeLessThanOrEqual(0.5);
    }
    for (const label of [...labels, wordmark, heading]) {
      expect(await label!.getAttribute('aria-hidden')).toBe('true');
      expect(await label!.getAttribute('inert')).not.toBeNull();
    }
    await writeFile(
      test.info().outputPath('icon-positions.json'),
      JSON.stringify(
        {
          names: [...names, 'Theme', 'Brand'],
          expanded: [...before, brandLeft],
          collapsed: [...after, (await brand.boundingBox())!.x],
        },
        null,
        2,
      ),
    );
    await test.info().attach('icon-positions', {
      body: JSON.stringify(
        {
          names: [...names, 'Theme', 'Brand'],
          expanded: [...before, brandLeft],
          collapsed: [...after, (await brand.boundingBox())!.x],
        },
        null,
        2,
      ),
      contentType: 'application/json',
    });

    await controls[1].click();
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(264);
    const restored = await Promise.all(icons.map(iconLeft));
    expect(restored).toEqual(before);
    await expect.poll(chevronBox).toEqual(expandedChevron);
  });
}

test('the collapse chevron glides between row and stack and reverses mid-flight', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await page.waitForTimeout(800);
  const result = await page.evaluate(async () => {
    const aside = document.querySelector('aside')!;
    const button = aside.querySelector<HTMLButtonElement>(
      '[aria-label="Collapse sidebar"], [aria-label="Expand sidebar"]',
    )!;
    const theme = aside.querySelector<HTMLButtonElement>('[aria-label="Toggle colour theme"]')!;
    const frame = () => new Promise<number>(requestAnimationFrame);
    const where = () => {
      const { left, top } = button.getBoundingClientRect();
      return { left, top, themeTop: theme.getBoundingClientRect().top };
    };
    const rest = where();
    const trail: { left: number; top: number }[] = [];
    button.click();
    const start = performance.now();
    while (performance.now() - start < 120) {
      await frame();
      trail.push(where());
    }
    // Reverse part-way: the chevron must head back without snapping.
    button.click();
    const reversed = where();
    await frame();
    const next = where();
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { rest, trail, reversed, next, settled: where() };
  });
  expect(result.rest.top).toBeCloseTo(result.rest.themeTop, 0);
  for (const sample of result.trail) {
    expect(sample.left).toBeLessThanOrEqual(result.rest.left + 0.5);
    expect(sample.top).toBeGreaterThanOrEqual(result.rest.top - 0.5);
  }
  expect(result.trail.at(-1)!.left).toBeLessThan(result.rest.left - 5);
  expect(result.trail.at(-1)!.top).toBeGreaterThan(result.rest.top + 5);
  // Nothing jumps on reversal; it eases back towards the row.
  expect(Math.abs(result.next.left - result.reversed.left)).toBeLessThan(60);
  expect(result.settled.left).toBeCloseTo(result.rest.left, 0);
  expect(result.settled.top).toBeCloseTo(result.rest.top, 0);
});

test('the collapse chevron snaps under reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.waitForTimeout(500);
  const button = page
    .getByRole('complementary')
    .getByRole('button', { name: /^(Collapse|Expand) sidebar$/ });
  const theme = page
    .getByRole('complementary')
    .getByRole('button', { name: 'Toggle colour theme' });
  const rowTop = (await theme.boundingBox())!.y;
  expect((await button.boundingBox())!.y).toBeCloseTo(rowTop, 0);
  await button.click();
  await expect
    .poll(async () => (await button.boundingBox())!.y, { timeout: 250 })
    .toBeGreaterThan(rowTop + 40);
});

test('width, active pill and content share each frame on Today', async ({ page, context }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  await expect(page.getByText('Exam-day forecast', { exact: true })).toBeVisible();
  await page.waitForTimeout(800);
  const directory = test.info().outputPath('motion');
  await mkdir(directory, { recursive: true });
  const session = await context.newCDPSession(page);
  await session.send('Tracing.start', {
    categories: 'devtools.timeline,blink.user_timing,cc,benchmark',
    transferMode: 'ReturnAsStream',
  });
  const samples = await page.evaluate(async () => {
    const aside = document.querySelector('aside')!;
    const main = document.querySelector('main')!;
    const button = aside.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!;
    const icon = aside.querySelector('nav a svg')!;
    const iconX = icon.getBoundingClientRect().left;
    const pill = aside.querySelector('nav a > span')!;
    const label = [...aside.querySelectorAll('span')].find(
      (span) => span.textContent === 'Search content',
    )!;
    const labelWidth = label.getBoundingClientRect().width;
    const frames: {
      direction: number;
      dt: number;
      width: number;
      gap: number;
      iconShift: number;
      pillLeft: number;
      pillWidth: number;
      labelWidth: number;
      opacity: number;
      tooltip: boolean;
    }[] = [];
    for (let direction = 0; direction < 8; direction++) {
      await new Promise(requestAnimationFrame);
      let previous = performance.now();
      button.click();
      const start = performance.now();
      while (performance.now() - start < 350) {
        const now = await new Promise<number>(requestAnimationFrame);
        const bounds = aside.getBoundingClientRect();
        const pillBounds = pill.getBoundingClientRect();
        frames.push({
          direction,
          dt: now - previous,
          width: bounds.width,
          gap: main.getBoundingClientRect().left - bounds.right,
          iconShift: icon.getBoundingClientRect().left - iconX,
          pillLeft: pillBounds.left,
          pillWidth: pillBounds.width,
          labelWidth: label.getBoundingClientRect().width - labelWidth,
          opacity: Number(getComputedStyle(label).opacity),
          tooltip: !!document.querySelector('[role=tooltip]'),
        });
        previous = now;
      }
    }
    return frames;
  });
  const tracingComplete = new Promise<{ stream?: string }>((resolve) =>
    session.once('Tracing.tracingComplete', resolve),
  );
  await session.send('Tracing.end');
  const { stream } = await tracingComplete;
  if (!stream) throw new Error('Chromium did not return a performance trace stream.');
  let trace = '';
  for (;;) {
    const chunk = await session.send('IO.read', { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await session.send('IO.close', { handle: stream });
  await writeFile(`${directory}/performance-trace.json`, trace);
  // The first callback can precede performance.now() by a fraction of a frame.
  const intervals = samples
    .filter((frame) => frame.dt > 0)
    .map((frame) => frame.dt)
    .sort((a, b) => a - b);
  const timing = {
    count: intervals.length,
    medianMs: intervals[Math.floor(intervals.length / 2)],
    p95Ms: intervals[Math.floor(intervals.length * 0.95)],
    maxMs: intervals.at(-1),
    over20Ms: intervals.filter((dt) => dt > 20).length,
  };
  await writeFile(`${directory}/frames.json`, JSON.stringify({ timing, samples }, null, 2));
  await test
    .info()
    .attach('frame-timing', { body: JSON.stringify(timing), contentType: 'application/json' });
  for (const frame of samples) {
    expect(frame.width).toBeGreaterThanOrEqual(72);
    expect(frame.width).toBeLessThanOrEqual(264);
    expect(Math.abs(frame.gap)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(frame.iconShift)).toBeLessThanOrEqual(0.5);
    expect(frame.pillLeft).toBe(12);
    expect(Math.abs(frame.pillWidth - (frame.width - 24))).toBeLessThanOrEqual(0.5);
    expect(Math.abs(frame.labelWidth)).toBeLessThanOrEqual(0.5);
    expect(frame.tooltip).toBe(false);
  }
  expect(samples.some((frame) => frame.width > 80 && frame.width < 250)).toBe(true);

  // Scrub the browser's real CSS transitions for reproducible frame-by-frame inspection.
  for (const direction of ['collapse', 'expand']) {
    const animations = await page.getByRole('complementary').evaluateHandle(async (aside) => {
      aside.querySelector<HTMLButtonElement>('[aria-label$="sidebar"]')!.click();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const animations = aside
        .getAnimations({ subtree: true })
        .filter((animation) => animation instanceof CSSTransition);
      animations.forEach((animation) => animation.pause());
      return animations;
    });
    for (const time of [0, 40, 80, 120, 160, 200, 240, 280]) {
      await animations.evaluate(
        (animations, time) =>
          animations.forEach((animation) => {
            animation.currentTime = time;
          }),
        time,
      );
      await page.screenshot({
        path: `${directory}/${direction}-${String(time).padStart(3, '0')}.png`,
      });
    }
    await animations.evaluate((animations) =>
      animations.forEach((animation) => animation.finish()),
    );
    await page.waitForTimeout(300);
  }
});

test('reduced motion switches width instantly and narrow desktops retain the rail', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  const sidebar = page.getByRole('complementary');
  const widths = await sidebar.evaluate(async (aside) => {
    aside.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click();
    await new Promise(requestAnimationFrame);
    const collapsed = aside.getBoundingClientRect().width;
    aside.querySelector<HTMLButtonElement>('[aria-label="Expand sidebar"]')!.click();
    await new Promise(requestAnimationFrame);
    return [collapsed, aside.getBoundingClientRect().width, aside.getAnimations().length];
  });
  expect(widths).toEqual([72, 264, 0]);
  await page.setViewportSize({ width: 1100, height: 1000 });
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(72);
  await expect(sidebar.getByRole('button', { name: /sidebar$/ })).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(264);
});

test('course lessons fold without unmounting and rail hover cards wait for the moving edge', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await enterFreshLacuna(page);
  const aside = page.getByRole('complementary');
  const course = aside.getByRole('link', { name: 'Welcome to Lacuna', exact: true });
  const expander = aside.getByRole('button', { name: 'Expand Welcome to Lacuna', exact: true });
  await expander.click();
  const lesson = aside.getByRole('link', {
    name: 'Core concepts & rendering',
    exact: true,
    includeHidden: true,
  });
  await expect(lesson).toBeVisible();
  const lessonNode = await lesson.elementHandle();
  const body = aside.locator(`[id="${await expander.getAttribute('aria-controls')}"]`);
  const height = await body
    .locator(':scope > div')
    .evaluate((content) => content.getBoundingClientRect().height);
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(height);
  await course.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await aside.evaluate((aside) =>
    aside.querySelector<HTMLButtonElement>('[aria-label="Collapse sidebar"]')!.click(),
  );
  await page.waitForTimeout(70);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  const midHeight = (await body.boundingBox())!.height;
  expect(midHeight).toBeGreaterThan(0);
  expect(midHeight).toBeLessThan(height);
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(0);
  expect(await lessonNode!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(body).toHaveAttribute('inert');
  await expect(body).toHaveAttribute('aria-hidden', 'true');
  await expect(aside.getByRole('button', { name: /Welcome to Lacuna/ })).toHaveCount(0);
  await page.mouse.move(600, 900);
  await course.hover();
  await expect(page.getByRole('tooltip')).toBeVisible();
  expect((await page.getByRole('tooltip').boundingBox())!.x).toBeGreaterThanOrEqual(72);
  await aside.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect.poll(async () => (await body.boundingBox())!.height).toBe(height);
  await expect(lesson).toBeVisible();
});
