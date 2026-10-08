import { expect, test, type Locator, type Page } from '@playwright/test';
import { chooseScheduledStudy, enterFreshLacuna } from './fixtures/lacunaApp';

async function openWelcomeCourse(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  return new URL(page.url()).hash.slice(1);
}

const box = async (locator: Locator) => (await locator.boundingBox())!;

test('the course bar keeps its section tabs and workspace mode on one height', async ({ page }) => {
  await openWelcomeCourse(page, 1440);
  // Hidden navigations (the phone section bar) are not exposed, so this is the tab track.
  const tabs = page.getByRole('navigation', { name: 'Course sections' });
  const mode = page.getByRole('group', { name: 'Workspace mode' });
  expect(Math.round((await box(mode)).height)).toBe(Math.round((await box(tabs)).height));
  // The compact pills still take a 44px target.
  const edit = mode.getByRole('button', { name: 'Edit mode', exact: true });
  expect(
    await edit.evaluate((element) => parseFloat(getComputedStyle(element, '::before').height)),
  ).toBeGreaterThanOrEqual(44);
});

test('the Lessons and Assessments headings share a line', async ({ page }) => {
  await openWelcomeCourse(page, 1440);
  const lessons = await box(page.getByRole('heading', { level: 2, name: 'Lessons', exact: true }));
  const assessments = await box(
    page.getByRole('heading', { level: 2, name: 'Assessments', exact: true }),
  );
  expect(Math.abs(lessons.y - assessments.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(lessons.height - assessments.height)).toBeLessThanOrEqual(1);
});

test('the forecast legend starts on the chart title edge', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const title = await box(page.getByRole('heading', { name: 'Exam-day forecast' }));
  const dot = await box(
    page.getByRole('list', { name: 'Courses' }).locator('li span[aria-hidden]').first(),
  );
  expect(Math.abs(dot.x - title.x)).toBeLessThanOrEqual(1);
});

test('the forecast title keeps to the top, level with the legend', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  const title = await box(page.getByRole('heading', { name: 'Exam-day forecast' }));
  const legend = await box(page.getByRole('list', { name: 'Courses' }));
  // Aligned to the legend's foot, the title fell further from the card's top with each row.
  expect(Math.abs(title.y - legend.y)).toBeLessThanOrEqual(1);
});

test('the Cards header offers its other ways as a 44px round control', async ({ page }) => {
  const course = await openWelcomeCourse(page, 1440);
  await page.goto(`/#${course}/cards`);
  const more = page.getByRole('button', { name: 'More ways to add', exact: true });
  const newCard = page.getByRole('button', { name: 'New card', exact: true }).first();
  const moreBox = await box(more);
  expect(Math.round(moreBox.width)).toBe(44);
  expect(Math.round(moreBox.height)).toBe(Math.round((await box(newCard)).height));
});

test('card rows show maths whole and cloze answers without stray spaces', async ({ page }) => {
  const course = await openWelcomeCourse(page, 1440);
  await page.goto(`/#${course}/cards`);
  // Its answer opens with a fraction, taller than a line of text.
  const answer = page
    .locator('[data-card-id]', { hasText: 'What is the derivative of' })
    .locator('[data-card-answer]');
  await expect(answer).toBeVisible();
  const fraction = await answer.evaluate((element) => {
    const outer = element.getBoundingClientRect();
    const inner = element.querySelector('.mfrac')!.getBoundingClientRect();
    return { top: inner.top - outer.top, bottom: outer.bottom - inner.bottom };
  });
  expect(fraction.top).toBeGreaterThanOrEqual(-0.5);
  expect(fraction.bottom).toBeGreaterThanOrEqual(-0.5);
  const reveal = page.locator('[data-card-answer] .cloze-reveal').first();
  expect(
    await reveal.evaluate((element) => {
      const style = getComputedStyle(element);
      return parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    }),
  ).toBe(0);
});

for (const width of [390, 1440]) {
  test(`the study header shares the card column at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await enterFreshLacuna(page);
    await page
      .getByRole('region', { name: 'Today, most urgent first' })
      .getByRole('button', { name: /^Study Welcome to Lacuna/ })
      .click();
    await chooseScheduledStudy(page);
    const timer = page.getByRole('button', { name: 'Pomodoro timer' });
    const exit = page.getByRole('button', { name: 'Exit', exact: true });
    const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
    const card = page.locator('[data-study-card-id]').first();
    await expect(continueButton.or(card).first()).toBeVisible();
    let onNotes: { x: number; y: number } | null = null;
    if (await continueButton.isVisible()) {
      onNotes = await box(timer);
      await continueButton.click();
    }
    await expect(card).toBeVisible();
    const cardBox = await box(card);
    const exitBox = await box(exit);
    expect(Math.abs(exitBox.x - cardBox.x)).toBeLessThanOrEqual(1);
    const undo = await box(page.getByRole('button', { name: 'Undo last answer' }));
    expect(Math.abs(undo.x + undo.width - (cardBox.x + cardBox.width))).toBeLessThanOrEqual(1);
    // The timer is the same 44px round control as its neighbours, and stays put.
    const timerBox = await box(timer);
    expect(Math.round(timerBox.width)).toBe(44);
    expect(
      Math.abs(timerBox.y + timerBox.height / 2 - (undo.y + undo.height / 2)),
    ).toBeLessThanOrEqual(1);
    if (onNotes) {
      expect(Math.abs(onNotes.x - timerBox.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(onNotes.y - timerBox.y)).toBeLessThanOrEqual(1);
    }
  });
}

test("a lesson's card list renders maths as the Cards page does", async ({ page }) => {
  await openWelcomeCourse(page, 1440);
  await page.getByText('Core concepts & rendering', { exact: true }).first().click();
  const list = page.getByRole('complementary').filter({ hasText: 'Cards in this lesson' });
  const row = list.getByRole('listitem').filter({ hasText: 'What is the derivative of' });
  await expect(row.locator('.katex').first()).toBeVisible();
  // KaTeX keeps the source in hidden MathML; outside the maths, no raw notation is left.
  expect(
    await row.evaluate((element) => {
      const copy = element.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('.katex').forEach((maths) => maths.remove());
      return copy.textContent;
    }),
  ).not.toContain('^');
});

test('a Markdown field marks focus on its whole frame, not an inner box', async ({ page }) => {
  const course = await openWelcomeCourse(page, 1440);
  await page.goto(`/#${course}/cards/new`);
  const front = page.getByRole('textbox', { name: 'Front' });
  await front.focus();
  await page.keyboard.press('a');
  // No visible inner ring: every shadow layer, if any, is transparent.
  expect(
    await front.evaluate((element) =>
      getComputedStyle(element)
        .boxShadow.split(/,(?![^(]*\))/)
        .every((layer) => layer.trim() === 'none' || layer.includes('rgba(0, 0, 0, 0)')),
    ),
  ).toBe(true);
  const frame = await front.evaluate((element) => {
    let node = element.parentElement;
    while (node && !node.className.includes('rounded-xl')) node = node.parentElement;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    return { border: getComputedStyle(node!).borderTopColor, accent };
  });
  const probe = await page.evaluate((accent) => {
    const element = document.createElement('div');
    element.style.color = `hsl(${accent})`;
    document.body.append(element);
    const colour = getComputedStyle(element).color;
    element.remove();
    return colour;
  }, frame.accent);
  expect(frame.border).toBe(probe);
});

test('a switch sits centred in its settings row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.goto('/#/settings');
  const toggle = page.getByRole('switch', { name: 'Show Today' });
  await toggle.scrollIntoViewIfNeeded();
  const row = await box(toggle.locator('xpath=ancestor::div[contains(@class,"grid")][1]'));
  const knob = await box(toggle);
  expect(Math.abs(knob.y + knob.height / 2 - (row.y + row.height / 2))).toBeLessThanOrEqual(1);
});

test('a study face centres an image under its centred text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('button', { name: /^Study Welcome to Lacuna/ })
    .click();
  await chooseScheduledStudy(page);
  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  const face = page.locator('[data-study-face] .prose-lacuna').first();
  await expect(continueButton.or(face).first()).toBeVisible();
  if (await continueButton.isVisible()) await continueButton.click();
  await expect(face).toBeVisible();
  const offset = await face.evaluate(async (prose) => {
    const image = document.createElement('img');
    image.src =
      'data:image/svg+xml,' +
      encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"/>');
    prose.append(image);
    await image.decode();
    const outer = prose.getBoundingClientRect();
    const inner = image.getBoundingClientRect();
    return inner.left + inner.width / 2 - (outer.left + outer.width / 2);
  });
  expect(Math.abs(offset)).toBeLessThanOrEqual(1);
});

test('the course tab pill glides between sections rather than jumping', async ({ page }) => {
  // Reduced motion rightly moves the pill at once; this checks the full-motion glide, so it
  // keeps the default preference from the first load.
  await page.setViewportSize({ width: 1440, height: 900 });
  await enterFreshLacuna(page);
  await page
    .getByRole('region', { name: 'Today, most urgent first' })
    .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/course\/[^/]+$/);
  const course = new URL(page.url()).hash.slice(1);
  // Visit Cards first: a route whose chunk is still loading mounts after the old bar has
  // gone, so the pill has nothing to glide from on a cold first visit.
  await page.goto(`/#${course}/cards`);
  await expect(page.getByRole('heading', { level: 1, name: 'Cards' })).toBeVisible();
  await page.goto(`/#${course}/settings`);
  const indicator = page.locator('[data-course-tab-indicator]');
  await expect(indicator).toBeVisible();
  // Relative to its track, since the page transition drifts the whole bar.
  const x = () =>
    indicator.evaluate(
      (element) =>
        element.getBoundingClientRect().x - element.closest('nav')!.getBoundingClientRect().x,
    );
  // Let the pill settle on Settings before moving it.
  let from = await x();
  await expect
    .poll(async () => {
      const previous = from;
      from = await x();
      return Math.abs(from - previous);
    })
    .toBeLessThan(0.5);
  // Record every frame in the page: the spring settles in about 100 ms, quicker than a
  // round trip per sample.
  await page.evaluate(() => {
    const track = window as unknown as { glide: number[] };
    track.glide = [];
    const started = performance.now();
    const sample = () => {
      const pill = document.querySelector('[data-course-tab-indicator]');
      const nav = pill?.closest('nav');
      if (pill && nav)
        track.glide.push(pill.getBoundingClientRect().x - nav.getBoundingClientRect().x);
      if (performance.now() - started < 1500) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page
    .getByRole('navigation', { name: 'Course sections' })
    .getByRole('link', { name: 'Cards', exact: true })
    .click();
  await expect(page).toHaveURL(/\/cards$/);
  await page.waitForTimeout(1600);
  const positions = await page.evaluate(() => (window as unknown as { glide: number[] }).glide);
  const to = positions.at(-1)!;
  expect(Math.abs(to - from)).toBeGreaterThan(100);
  // At least one sampled frame sits clearly between the two tabs.
  expect(positions.some((x) => Math.min(Math.abs(x - from), Math.abs(x - to)) > 20)).toBe(true);
});

test('an inline confirmation swaps without scaling its text', async ({ page }) => {
  await openWelcomeCourse(page, 1440);
  await page.getByText('Core concepts & rendering', { exact: true }).first().click();
  await page.getByRole('button', { name: 'Edit mode' }).click();
  await page.getByTitle('Delete note').click();
  const confirmation = page.getByText('Delete?', { exact: true });
  let widest = 0;
  for (let frame = 0; frame < 20; frame++) {
    widest = Math.max(
      widest,
      await confirmation.evaluate((element) => {
        let scale = 1;
        for (let node: Element | null = element; node; node = node.parentElement) {
          const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
          scale *= matrix.a;
        }
        return Math.abs(1 - scale);
      }),
    );
    await page.waitForTimeout(16);
  }
  // The swap's own fade starts at 0.98; anything more is a layout squash.
  expect(widest).toBeLessThanOrEqual(0.021);
});
