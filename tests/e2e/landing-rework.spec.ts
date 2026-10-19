import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const headings = [
  'Scheduled for your exam, not for ever.',
  'One number, and it means something.',
  "Did you know it? That's the whole question.",
  'Practise the exam, not just the facts.',
  'Yours, on your device.',
  'A few questions.',
  'Your exam has a date. Start there.',
];
const copy = [
  "Most flashcard apps space reviews out indefinitely. Lacuna simulates every card forward to your exam date and reviews whatever raises that day's score most.",
  'The forecast is what Lacuna optimises. If it says 84%, that is how much it expects you to recall on the day.',
  'Answer Yes or No. Lacuna works out how well you knew it from how quickly you answered.',
  'Write answers to exam questions. Lacuna marks them against the mark scheme and schedules them alongside your cards.',
  'No account. Everything stays on your device, with backups to a file and optional encrypted sync.',
];
const allowed = new Set([
  ...headings,
  ...copy,
  'Exam',
  '1d',
  '4d',
  '11d',
  '1mo',
  '3mo',
  '84%',
  '78%',
  'la bibliothèque',
  'No',
  'Yes',
  'Describe osmosis.',
  'Water crosses a membrane.',
  'It is partially permeable.',
  'Water molecules move',
  'Partially permeable membrane',
  'Dilute to concentrated solution',
  '2/3',
  'Is Lacuna free?',
  'Yes. Lacuna is free and open source, with no subscription.',
  'Can I bring my Anki decks?',
  'Yes. Import an Anki .apkg file to bring your cards into Lacuna.',
  'Can I study offline?',
  'Yes. Once the app and your material are on your device, you can study offline. Embedded online videos still need an internet connection.',
  'Start revising',
  'Lacuna',
  'GitHub',
  'The method',
  'Lacuna vs Quizlet',
  'Download for desktop',
]);

for (const width of [1440, 390]) {
  for (const reducedMotion of ['no-preference', 'reduce'] as const) {
    test(`exact landing structure at ${width}px with ${reducedMotion}`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.emulateMedia({ reducedMotion });
      await page.goto('/#/landing');
      await expect(page.locator('main h2')).toHaveText(headings);
      await expect(page.locator('.landing-feature-copy > p')).toHaveText(copy);
      const discover = page.getByRole('link', { name: 'See how it works' });
      await expect(discover).toHaveAttribute('href', '#how-it-works');
      await discover.click();
      await expect(page.locator('#how-it-works')).toBeFocused();
      await expect(page.getByRole('heading', { name: headings[0], exact: true })).toBeInViewport();
      for (const section of await page.locator('.landing-feature').all()) {
        await expect(section.locator('h2')).toHaveCount(1);
        const visual = section.locator('.landing-feature-visual');
        if (!(await visual.count())) continue;
        await expect(visual).toHaveAttribute('aria-hidden', 'true');
        await expect(visual.locator('button, a, input, [tabindex]')).toHaveCount(0);
        if (width === 390) {
          // Smooth scrolling can move the viewport between separate position reads.
          const { copyBottom, visualTop } = await section.evaluate((node) => ({
            copyBottom: node.querySelector('.landing-feature-copy')!.getBoundingClientRect().bottom,
            visualTop: node.querySelector('.landing-feature-visual')!.getBoundingClientRect().top,
          }));
          expect(copyBottom).toBeLessThan(visualTop);
        }
      }
      if (width === 1440) {
        const sections = await page.locator('.landing-feature').all();
        for (let i = 0; i < 4; i++) {
          const text = (await sections[i].locator('.landing-feature-copy').boundingBox())!;
          const visual = (await sections[i].locator('.landing-feature-visual').boundingBox())!;
          expect(text.x < visual.x).toBe(i % 2 === 0);
          expect((await sections[i].boundingBox())!.height).toBeGreaterThanOrEqual(630);
        }
        expect(
          await page
            .locator('main h2')
            .first()
            .evaluate((node) => getComputedStyle(node).fontFamily),
        ).toBe(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontFamily));
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('.motion-nav-mark')).toHaveCSS('opacity', '0');
      mkdirSync('artifacts/landing-rework', { recursive: true });
      await page.screenshot({
        path: `artifacts/landing-rework/${width}-${reducedMotion}.png`,
        fullPage: true,
      });
    });
  }
}

test('below-hero visible text matches the allowlist, including expanded FAQ answers', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/landing');
  await expect(page.locator('main h2')).toHaveText(headings);
  for (const summary of await page.locator('.landing-faq summary').all()) await summary.click();
  const lines = await page.evaluate(() => {
    const bodyText = document.body.innerText;
    const firstHeading = document.querySelector('#how-it-works h2')!.textContent!;
    return [
      ...new Set(
        bodyText
          .slice(bodyText.indexOf(firstHeading))
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
      ),
    ];
  });
  const unexpected = lines.filter((line) => !allowed.has(line));
  const missing = [...allowed].filter((line) => !lines.includes(line));
  const output = [
    'Viewport: 1440x900; FAQ: expanded',
    ...lines,
    `Unexpected lines: ${JSON.stringify(unexpected)}`,
    `Missing lines: ${JSON.stringify(missing)}`,
  ].join('\n');
  mkdirSync('artifacts/landing-rework', { recursive: true });
  writeFileSync('artifacts/landing-rework/self-check.txt', `${output}\n`);
  expect(unexpected).toEqual([]);
  expect(missing).toEqual([]);
});

test('FAQ supports keyboard disclosure and retained download navigation works', async ({
  page,
}) => {
  await page.goto('/#/landing');
  const summary = page.locator('.landing-faq summary').first();
  await summary.focus();
  await summary.press('Enter');
  await expect(
    page.getByText('Yes. Lacuna is free and open source, with no subscription.'),
  ).toBeVisible();
  await summary.press('Space');
  await expect(
    page.getByText('Yes. Lacuna is free and open source, with no subscription.'),
  ).toBeHidden();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Download for desktop' }).click();
  await expect(page).toHaveURL(/#\/download$/);
});

test('enlarged text fits the phone without clipping the new sections', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/landing');
  await expect(page.locator('main h2')).toHaveText(headings);
  await page.addStyleTag({
    content:
      '.landing-feature h2, .landing-feature p, .landing-faq h2, .landing-faq summary, .landing-ending h2 { font-size: 200% !important; }',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  for (const section of await page.locator('.landing-feature').all()) {
    const bounds = (await section.boundingBox())!;
    const copyBounds = (await section.locator('.landing-feature-copy').boundingBox())!;
    expect(copyBounds.x + copyBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(copyBounds.y + copyBounds.height).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
});
