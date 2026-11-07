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
  source?: { cards: Record<string, string>; suspendedPrompt: string },
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
  return {
    main,
    prompt: main.getByText(/^What is the French for .+\?$/).filter({ visible: true }),
    choices: main.getByRole('radio'),
    typing: main.getByRole('textbox', { name: 'Your answer' }),
    check: main.getByRole('button', { name: 'Check answer', exact: true }),
    feedback: main.getByRole('status').filter({ hasText: /^(Correct|Incorrect)\./ }),
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

test('introduces choices before timed typing and keeps the old practice entry', async ({
  page,
}, testInfo) => {
  const { lessonId, cards } = await seedLesson(page);
  const lessonUrl = `/#/lesson/${lessonId}/learn`;
  await page.goto(lessonUrl);
  await page.addScriptTag({ content: fixture });

  const view = study(page);
  await expect(view.choices).toHaveCount(4);
  await expect(view.check).toBeDisabled();
  const progress = page.getByRole('progressbar', { name: 'Chunks complete' });
  await expect(progress.locator('[data-session-card-status]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('learn-new-cards-choice.png') });
  const first = await view.prompt.innerText();
  await expect(view.choices.first()).toBeFocused();
  const wrongIndex = (await view.choices.nth(1).inputValue()) === cards[first] ? 2 : 1;
  await page.keyboard.press('ArrowRight');
  if (wrongIndex === 2) await page.keyboard.press('ArrowRight');
  await expect(view.choices.nth(wrongIndex)).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(view.check).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view.feedback).toContainText(`Correct answer: ${cards[first]}`);
  await page.screenshot({ path: testInfo.outputPath('learn-new-cards-retry.png') });
  expect(await readReviews(page)).toHaveLength(0);
  await expect(view.advance).toBeFocused();
  await page.keyboard.press('Enter');

  const firstChunk = new Set([first]);
  for (let index = 0; index < 3; index += 1) {
    await expect(view.choices).toHaveCount(4);
    const prompt = await view.prompt.innerText();
    expect(firstChunk.has(prompt)).toBe(false);
    firstChunk.add(prompt);
    await choose(view, cards[prompt]);
    await expect(view.feedback).toHaveText('Correct.');
    await view.advance.click();
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
      await expect(view.main.getByText('Marked incorrect.', { exact: true })).toBeVisible();
      await expect(view.advance).toBeFocused();
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
      await expect(view.feedback).toHaveText('Correct.');
      await view.advance.click();
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
  await view.advance.click();
  await expect(view.choices).toHaveCount(4);
  const nextPrompt = await view.prompt.innerText();
  await expect.poll(optionText).toEqual(expectedChoices.get(nextPrompt));

  await page.reload();
  await expect(view.choices).toHaveCount(4);
  const resumedPrompt = await view.prompt.innerText();
  expect(resumedPrompt).toBe(nextPrompt);
  await choose(view, cards[resumedPrompt]);
  await view.advance.click();
  await expect(view.choices).toHaveCount(4);
  const cachedPrompt = await view.prompt.innerText();
  expect(cachedPrompt).not.toBe(resumedPrompt);
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
