import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';
import type * as ChoiceFixture from './fixtures/simpleLearnChoices';

declare global {
  interface Window {
    SimpleLearnChoicesFixture: typeof ChoiceFixture;
  }
}

let fixture: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/simpleLearnChoices.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'SimpleLearnChoicesFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  fixture = bundle.outputFiles[0].text;
});

async function seedLesson(
  page: Page,
  source?: { cards: Record<string, string>; suspendedPrompt?: string },
) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enterFreshLacuna(page);
  await page.addScriptTag({ content: fixture });
  return page.evaluate(
    (input) =>
      window.SimpleLearnChoicesFixture.seed(input?.cards, undefined, input?.suspendedPrompt),
    source,
  );
}

const readReviews = (page: Page) => page.evaluate(() => window.SimpleLearnChoicesFixture.reviews());

async function enableJev(page: Page) {
  await page.route('**/api/ai/session', (route) =>
    route.fulfill({ json: { token: 'preview-session', expiresAt: Date.now() + 600_000 } }),
  );
  await page.evaluate(() => {
    localStorage.setItem('lacuna.jevInstallation', 'a'.repeat(64));
    localStorage.setItem(
      'lacuna.jevSettings',
      JSON.stringify({ enabled: true, acceptedConsentVersion: 2 }),
    );
  });
}

function study(page: Page) {
  const main = page.getByRole('main', { name: 'Study card' });
  const activeCard = main.locator('[data-study-card-id]:not([inert])');
  return {
    main,
    prompt: activeCard
      .locator('[data-study-face="front"]')
      .getByText(/^What is the French for .+\?$/),
    revealed: activeCard.locator('[data-study-face="back"]'),
    choiceControls: main.locator('[data-study-choices]'),
    choices: main.getByRole('radio'),
    typing: main.getByRole('textbox', { name: 'Your answer' }),
    check: main.getByRole('button', { name: 'Check answer', exact: true }),
    advance: main.getByRole('button', { name: 'Continue', exact: true }),
  };
}

async function choose(view: ReturnType<typeof study>, answer: string) {
  const choice = view.main.getByRole('radio', { name: answer, exact: true });
  await choice.focus();
  await choice.press('Space');
  await expect(choice).toBeChecked();
  await view.check.click();
}

async function nextPrompt(view: ReturnType<typeof study>, previous: string) {
  await expect
    .poll(async () => {
      const [text] = await view.prompt.allTextContents();
      return Boolean(text && text !== previous);
    })
    .toBe(true);
  return view.prompt.innerText();
}

test('keeps long choices on one scrollable line and brings keyboard focus into view', async ({
  page,
}, testInfo) => {
  const { lessonId } = await seedLesson(page, {
    cards: {
      'Where does the water in a river come from?':
        'Rainwater runs downhill across the land and collects in streams.',
      'Why does a river slow down when it reaches the sea?':
        'The land becomes flatter near the coast and the current spreads out.',
      'How does sediment reach the mouth of a river?':
        'The current carries loose sand and mud downstream through the channel.',
      'Why does a river change shape after a flood?':
        'Fast water erodes the banks and leaves sediment behind as it recedes.',
    },
  });
  await page.goto(`/#/lesson/${lessonId}/learn`);
  const { choices, choiceControls, check } = study(page);
  await expect(choices).toHaveCount(4);
  const labels = choices.locator('..');
  const row = choiceControls.locator('.qs-choices').locator('..');
  const positions = await labels.evaluateAll((labels) =>
    labels.map((label) => {
      const text = document.createRange();
      text.selectNodeContents(label.querySelector('.qs-choice-content')!);
      return { top: label.getBoundingClientRect().top, lines: text.getClientRects().length };
    }),
  );
  expect(new Set(positions.map(({ top }) => top)).size).toBe(1);
  expect(positions.map(({ lines }) => lines)).toEqual([1, 1, 1, 1]);
  expect(await row.evaluate((row) => row.scrollWidth > row.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1440);
  await expect(labels.first()).toBeInViewport({ ratio: 1 });
  await expect(choices.first()).toBeFocused();
  await testInfo.attach('Single-line choices', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.keyboard.press('4');
  await expect(choices.last()).toBeChecked();
  await expect(labels.last()).toBeInViewport({ ratio: 1 });
  await page.keyboard.press('ArrowRight');
  await expect(choices.first()).toBeChecked();
  await expect(labels.first()).toBeInViewport({ ratio: 1 });
  await expect(check).toBeEnabled();
});

test('introduces choices before timed typing and keeps the old practice entry', async ({
  page,
}, testInfo) => {
  const { lessonId, cards } = await seedLesson(page);
  const lessonUrl = `/#/lesson/${lessonId}/learn`;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto(lessonUrl);
  await page.addScriptTag({ content: fixture });
  const view = study(page);
  await expect(view.choices).toHaveCount(4);
  const exitButton = page.getByRole('banner').getByRole('button', { name: 'Exit', exact: true });
  await exitButton.evaluate((exit) => {
    let interrupted = false;
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const rim = node.matches('[data-study-rim]')
            ? node
            : node.querySelector('[data-study-rim]');
          const verdict = rim?.getAttribute('data-study-rim');
          if (verdict) document.documentElement.setAttribute('data-tested-study-rim', verdict);
          if (verdict === 'negative' && !interrupted && exit instanceof HTMLElement) {
            interrupted = true;
            exit.click();
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
  const recordedRim = page.locator('html');

  await expect(view.check).toBeDisabled();
  const progress = page.getByRole('progressbar', { name: 'Session progress' });
  await expect(progress).toHaveAttribute('aria-valuetext', '0 of 12 cards complete');
  await page.screenshot({ path: testInfo.outputPath('learn-new-cards-choice.png') });
  const hoverLabel = view.choices.nth(1).locator('..');
  await hoverLabel.hover();
  await expect(hoverLabel.locator('.flow-feedback-layer')).toHaveCSS('border-radius', '9999px');
  await page.screenshot({ path: testInfo.outputPath('learn-new-cards-pill-hover.png') });
  const first = await view.prompt.innerText();
  await expect(view.choices.first()).toBeFocused();
  const wrongIndex = (await view.choices.nth(1).inputValue()) === cards[first] ? 2 : 1;
  await page.keyboard.press('ArrowRight');
  await expect(view.choices.nth(1)).toBeChecked();
  await page.keyboard.press('1');
  await expect(view.choices.first()).toBeChecked();
  await page.keyboard.press(String(wrongIndex + 1));
  await expect(view.choices.nth(wrongIndex)).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(view.choiceControls).toHaveAttribute('aria-busy', 'true');
  await expect(view.choices).toHaveCount(0);
  await expect(view.choiceControls.locator('.qs-choices').locator('..')).toHaveCSS('opacity', '0');
  await expect(view.revealed).toHaveText(cards[first]);
  await expect(view.advance).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('learn-new-cards-retry.png') });
  expect(await readReviews(page)).toHaveLength(0);
  await expect(recordedRim).toHaveAttribute('data-tested-study-rim', 'negative');
  const leave = page.getByRole('dialog', { name: 'Leave this session?' });
  await leave.getByRole('button', { name: 'Stay' }).click();
  await expect(view.revealed).toHaveText(cards[first]);
  await nextPrompt(view, first);

  const firstChunk = new Set([first]);
  for (let index = 0; index < 3; index += 1) {
    await expect(view.choices).toHaveCount(4);
    const prompt = await view.prompt.innerText();
    expect(firstChunk.has(prompt)).toBe(false);
    firstChunk.add(prompt);
    if (index === 0) {
      const ordered = await view.choices.evaluateAll((options) =>
        options.map((option) => option.getAttribute('value')),
      );
      await page.keyboard.press(String(ordered.indexOf(cards[prompt]) + 1));
      await expect(
        view.main.getByRole('radio', { name: cards[prompt], exact: true }),
      ).toBeChecked();
      await page.keyboard.press('Space');
      await expect(view.choiceControls).toHaveAttribute('aria-busy', 'true');
      await expect(view.revealed).toHaveText(cards[prompt]);
      await expect(recordedRim).toHaveAttribute('data-tested-study-rim', 'positive');
    } else {
      await choose(view, cards[prompt]);
    }
    await nextPrompt(view, prompt);
    if (index === 0) await page.emulateMedia({ reducedMotion: 'reduce' });
  }
  expect(await readReviews(page)).toHaveLength(0);

  let retried = false;
  let typed = false;
  for (let index = 0; index < 12 && (!retried || !typed); index += 1) {
    await expect
      .poll(async () => (await view.typing.isVisible()) || (await view.choices.count()) === 4)
      .toBe(true);
    const prompt = await view.prompt.innerText();
    if (await view.typing.isVisible()) {
      if (!typed) {
        expect(firstChunk.has(prompt)).toBe(true);
        await page.screenshot({ path: testInfo.outputPath('learn-new-cards-typing.png') });
      }
      const reviewCount = (await readReviews(page)).length;
      await expect(view.typing).toBeFocused();
      await view.typing.fill('incorrect answer');
      await page.keyboard.press('Enter');
      const verdict = view.main.locator(
        '[data-flow-state="bead"] [data-flow-verdict][data-flow-colour]',
      );
      await expect(verdict).toBeVisible();
      await expect(verdict).toHaveAttribute('style', /fill: var\(--color-negative\)/);
      await expect(
        view.main.getByRole('status').filter({ hasText: 'Marked incorrect.' }),
      ).toHaveClass('sr-only');
      await expect(view.advance).toBeFocused();
      if (!typed)
        await page.screenshot({ path: testInfo.outputPath('learn-new-cards-typed-incorrect.png') });
      await page.keyboard.press('Enter');
      await expect.poll(async () => (await readReviews(page)).length).toBe(reviewCount + 1);
      expect(await readReviews(page)).toEqual(
        Array.from({ length: reviewCount + 1 }, () =>
          expect.objectContaining({ input: 'typed', grade: 1 }),
        ),
      );
      typed = true;
    } else {
      if (prompt === first) retried = true;
      await choose(view, cards[prompt]);
      await nextPrompt(view, prompt);
    }
  }
  expect(retried).toBe(true);
  expect(typed).toBe(true);

  await page.goto(`${lessonUrl}?mode=simple`);
  await expect(
    view.main.getByRole('button', { name: 'Show answer', exact: true }).last(),
  ).toBeVisible();
  await expect(view.choices).toHaveCount(0);
});

test('counts completed cards across choices and typing and restores the count on resume', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('lacuna-theme', 'light'));
  const { lessonId, cards } = await seedLesson(page);
  await page.goto(`/#/lesson/${lessonId}/learn`);
  const view = study(page);
  const progress = page.getByRole('progressbar', { name: 'Session progress' });
  const banner = page.getByRole('banner');
  const expectCompletion = async (count: number) => {
    const label = `${count} of 12 cards complete`;
    await expect(banner.getByText(label, { exact: true })).toBeVisible();
    await expect(progress).toHaveAttribute('aria-valuetext', label);
    await expect(progress).toHaveAttribute('aria-valuenow', String(Math.round((count / 12) * 100)));
  };

  for (let index = 0; index < 5; index += 1) {
    const prompt = await view.prompt.innerText();
    await choose(view, cards[prompt]);
    await nextPrompt(view, prompt);
  }
  await expect(view.typing).toBeFocused();
  await expectCompletion(0);

  const typedPrompt = await view.prompt.innerText();
  const checkTyped = async () => {
    await view.typing.fill(cards[typedPrompt]);
    await view.typing.press('Enter');
    await expect(view.main.getByRole('status').filter({ hasText: 'Marked correct.' })).toHaveClass(
      'sr-only',
    );
  };
  const continueTyped = async () => {
    await view.advance.click();
    await expect(view.choices).toHaveCount(4);
    await expectCompletion(1);
  };
  await checkTyped();
  await page.screenshot({ path: testInfo.outputPath('simple-learn-typed-feedback.png') });
  await continueTyped();
  await banner.getByRole('button', { name: 'Undo last answer' }).click();
  await expect(view.typing).toBeFocused();
  await expectCompletion(0);
  await checkTyped();
  await continueTyped();
  await page.screenshot({ path: testInfo.outputPath('simple-learn-progress-choices.png') });

  const choicePrompt = await view.prompt.innerText();
  await choose(view, cards[choicePrompt]);
  await expect(view.typing).toBeFocused();
  await expectCompletion(1);
  await page.reload();
  await expect(view.typing).toBeFocused();
  await expectCompletion(1);
  await page.screenshot({ path: testInfo.outputPath('simple-learn-progress-typing.png') });
});

test('prepares one lesson-wide Jev shortlist and reuses it after reload', async ({ page }) => {
  const { lessonId, cards } = await seedLesson(page);
  let releaseRankings!: () => void;
  const held = new Promise<void>((resolve) => {
    releaseRankings = resolve;
  });
  await enableJev(page);
  let preparationRequests = 0;
  const expectedChoices = new Map<string, string[]>();
  await page.route('**/api/ai/jev', async (route) => {
    const request: { purpose: string; cards: { prompt: string; answer: string }[] } = route
      .request()
      .postDataJSON();
    expect(request.purpose).toBe('lesson-distractors');
    preparationRequests++;
    expect(request.cards.map((card) => card.answer).sort()).toEqual(Object.values(cards).sort());
    const rankings = request.cards.map((card, target) => {
      const indexes = request.cards
        .map((_, index) => index)
        .filter((index) => index !== target)
        .reverse()
        .slice(0, 3);
      expectedChoices.set(
        card.prompt,
        [card.answer, ...indexes.map((index) => request.cards[index].answer)].sort(),
      );
      return indexes;
    });
    await held;
    await route.fulfill({ json: { model: 'jev-1.14.0', inputTokens: 1234, rankings } });
  });
  await page.goto(`/#/lesson/${lessonId}/learn`);
  const view = study(page);
  const optionText = () =>
    view.choices.evaluateAll((options) =>
      options.map((option) => option.parentElement?.textContent?.trim() ?? '').sort(),
    );
  await expect(view.choices).toHaveCount(4);
  const firstPrompt = await view.prompt.innerText();
  const firstOptions = await optionText();
  await expect.poll(() => preparationRequests).toBe(1);
  const response = page.waitForResponse((reply) => reply.url().endsWith('/api/ai/jev'));
  releaseRankings();
  expect((await response).ok()).toBe(true);
  expect(await optionText()).toEqual(firstOptions);
  await choose(view, cards[firstPrompt]);
  const rankedPrompt = await nextPrompt(view, firstPrompt);
  await expect(view.choices).toHaveCount(4);
  await expect.poll(optionText).toEqual(expectedChoices.get(rankedPrompt));

  await page.reload();
  await expect(view.choices).toHaveCount(4);
  const resumedPrompt = await view.prompt.innerText();
  expect(resumedPrompt).toBe(rankedPrompt);
  await choose(view, cards[resumedPrompt]);
  const cachedPrompt = await nextPrompt(view, resumedPrompt);
  await expect(view.choices).toHaveCount(4);
  await expect.poll(optionText).toEqual(expectedChoices.get(cachedPrompt));
  expect(preparationRequests).toBe(1);
});

test('withholds suspended choices and lets a Jev-marked recall be resubmitted after undo', async ({
  page,
}) => {
  const prompt = 'What is the French for aeroplane?';
  const suspendedPrompt = 'What is the French for ferry?';
  const { lessonId } = await seedLesson(page, {
    cards: { [prompt]: 'avion', [suspendedPrompt]: 'ferry' },
    suspendedPrompt,
  });
  await enableJev(page);
  let marks = 0;
  await page.route('**/api/ai/jev', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      purpose: 'typed-equivalence',
      expected: 'avion',
      answer: 'aéronef',
    });
    marks++;
    await route.fulfill({
      json: {
        model: 'jev-1.14.0',
        inputTokens: 100,
        value: 1,
        confidence: 0.99,
        feedback: { kind: 'same', parts: [] },
      },
    });
  });
  await page.goto(`/#/lesson/${lessonId}/learn`);
  await page.addScriptTag({ content: fixture });
  const view = study(page);
  const reveal = view.main.getByRole('button', { name: 'Show answer', exact: true });
  await expect(reveal).toBeFocused();
  await expect(view.choices).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(view.advance).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view.typing).toBeFocused();
  await view.typing.fill('aéronef');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readReviews(page)).length).toBe(1);
  expect(marks).toBe(1);

  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(view.typing).toBeFocused();
  await expect(view.typing).toHaveValue('aéronef');
  expect(await readReviews(page)).toHaveLength(0);
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await readReviews(page)).length).toBe(1);
  expect(marks).toBe(1);
});
