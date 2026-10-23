import { build } from 'esbuild';
import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

let fixture: string;
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: ['tests/e2e/fixtures/jevStudy.ts'],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    globalName: 'JevStudyFixture',
    define: { 'import.meta.env.DEV': 'false' },
  });
  fixture = bundle.outputFiles[0].text;
});

async function start(page: Page, enabled = true, simple = false, globalTyping = false) {
  await page.route('**/api/ai/session', (route) =>
    route.fulfill({
      json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 },
    }),
  );
  await enterFreshLacuna(page);
  await page.addScriptTag({ content: fixture });
  const seeded = await page.evaluate(async ({ enabled, globalTyping }) => {
    const fixture = (
      window as unknown as {
        JevStudyFixture: {
          seed(enabled: boolean, globalTyping: boolean): Promise<{ lessonId: string; cardIds: string[] }>;
        };
      }
    ).JevStudyFixture;
    return fixture.seed(enabled, globalTyping);
  }, { enabled, globalTyping });
  await page.goto(`/#/lesson/${seeded.lessonId}/learn?${simple ? 'mode=simple' : 'filter=new'}`);
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
}

async function submit(page: Page, answer = 'Red and blue') {
  await page.getByRole('textbox', { name: 'Your answer' }).fill(answer);
  await page.getByRole('button', { name: 'Check answer', exact: true }).click();
}

const feedback = {
  kind: 'partial',
  parts: [
    { start: 0, end: 3, covered: true },
    { start: 5, end: 10, covered: false },
    { start: 15, end: 19, covered: true },
  ],
};

async function flowColour(page: Page) {
  return page.locator('[data-flow-colour]').evaluate((element) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    context.fillStyle = getComputedStyle(element).fill;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  });
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  for (const correct of [false, true]) {
    test(`morphs a grey waiting bead into a ${correct ? 'green' : 'red'} verdict (${reducedMotion})`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion });
      let release!: () => void;
      const response = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/ai/jev', async (route) => {
        await response;
        await route.fulfill({
          json: {
            value: correct ? 1 : 0,
            confidence: 0.98,
            inputTokens: 600,
            model: 'jev-1.14.0',
          },
        });
      });
      await start(page);
      await submit(page);
      await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toBeVisible();
      await page.keyboard.down('Space');
      try {
        const layer = page.locator('[data-flow-layer]');
        await expect(layer).toBeVisible();
        const grey = await flowColour(page);
        expect(grey[0]).toBe(grey[1]);
        expect(grey[1]).toBe(grey[2]);
        expect(grey[3]).toBe(255);

        // The whole bead pulses evenly, retaining a circle rather than deforming its drops.
        const bead = layer.locator(':scope > g');
        const before = await bead.getAttribute('style');
        await page.waitForTimeout(400);
        const after = await bead.getAttribute('style');
        if (reducedMotion === 'reduce') expect(after).toBe(before);
        else expect(after).not.toBe(before);
        const aspectRatio = await layer.locator(':scope > g > g').first().locator('use').first()
          .evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.width / bounds.height;
          });
        expect(aspectRatio).toBeCloseTo(1, 1);
        await page.screenshot({ path: test.info().outputPath('grey-waiting.png') });

        await page.locator('[data-flow-colour]').evaluate((element) => {
          (window as unknown as { flowColourFrames: Promise<string[]> }).flowColourFrames =
            new Promise((resolve) => {
              const fills: string[] = [];
              const started = performance.now();
              const sample = () => {
                fills.push(getComputedStyle(element).fill);
                if (performance.now() - started < 500) requestAnimationFrame(sample);
                else resolve(fills);
              };
              sample();
            });
        });
        release();
        await expect.poll(async () => {
          const [r, g, b] = await flowColour(page);
          return correct ? g > r && g > b : r > g && r > b;
        }).toBe(true);
        const fills = await page.evaluate(
          () => (window as unknown as { flowColourFrames: Promise<string[]> }).flowColourFrames,
        );
        if (reducedMotion !== 'reduce') expect(new Set(fills).size).toBeGreaterThan(2);
        await expect(layer).toBeVisible();
        await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'No', exact: true })).toHaveCount(0);
        await page.screenshot({ path: test.info().outputPath('verdict-colour.png') });
      } finally {
        release();
        await page.keyboard.up('Space');
      }
    });
  }
}

test('keeps the verdict off the self-marking grades, advances and can undo it', async ({ page }) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ai/jev', async (route) => {
    await response;
    await route.fulfill({
      json: {
        value: 0,
        confidence: 0.98,
        inputTokens: 600,
        model: 'jev-1.14.0',
        feedback,
      },
    });
  });
  await start(page);
  const card = page.locator('[data-study-card-id]').first();
  const id = await card.getAttribute('data-study-card-id');
  await submit(page);
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('jev-checking.png') });
  release();
  await expect(page.locator('[data-study-face="back"] [data-typed-verdict]')).toContainText(
    'Partly right',
  );
  await expect(page.locator('[data-study-face="back"] mark')).toHaveText('green');
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'No', exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('jev-verdict.png') });
  await expect(card).not.toHaveAttribute('data-study-card-id', id!);
  await page.getByRole('button', { name: 'Undo last answer' }).click();
  await expect(page.locator('[data-study-card-id]').first()).toHaveAttribute(
    'data-study-card-id',
    id!,
  );
  await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath('jev-undo-manual.png') });
});

test('restores pointer grading after a timeout and ignores a late verdict', async ({ page }) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ai/jev', async (route) => {
    await response;
    await route.fulfill({
      json: {
        value: 1,
        confidence: 0.99,
        inputTokens: 600,
        model: 'jev-1.14.0',
        feedback,
      },
    });
  });
  await start(page);
  const id = await page.locator('[data-study-card-id]').first().getAttribute('data-study-card-id');
  await submit(page);
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeEnabled();
  release();
  await expect(page.locator('[data-study-card-id]').first()).toHaveAttribute(
    'data-study-card-id',
    id!,
  );
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.locator('[data-study-card-id]').first()).not.toHaveAttribute(
    'data-study-card-id',
    id!,
  );
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`retains unsure feedback with manual grading (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.route('**/api/ai/jev', (route) =>
      route.fulfill({
        json: {
          value: null,
          confidence: 0.5,
          inputTokens: 600,
          model: 'jev-1.14.0',
          feedback,
        },
      }),
    );
    await start(page);
    await submit(page);
    const verdict = page.locator('[data-study-face="back"] [data-typed-verdict]');
    const missed = page.locator('[data-study-face="back"] mark');
    await expect(verdict).toContainText('Partly right');
    await expect(missed).toHaveText('green');
    await expect(page.getByRole('button', { name: 'No', exact: true })).toBeVisible();
    if (reducedMotion === 'reduce') {
      await expect(verdict).toHaveCSS('animation-name', 'none');
      await expect(missed).toHaveCSS('animation-name', 'none');
    }
    await page.screenshot({ path: test.info().outputPath(`jev-unsure-${reducedMotion}.png`) });
  });
}

test('uses legacy feedback without requests while switched off', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/ai/jev', (route) => {
    calls++;
    return route.abort();
  });
  await start(page, false);
  await submit(page, 'Yellow');
  await expect(page.locator('[data-study-face="back"] del')).not.toHaveCount(0);
  await expect(page.locator('[data-study-face="back"] [data-typed-verdict]')).toHaveCount(0);
  expect(calls).toBe(0);
});

test('marks an exact match locally without calling Jev', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/ai/jev', (route) => {
    calls++;
    return route.abort();
  });
  await start(page);
  const id = await page.locator('[data-study-card-id]').first().getAttribute('data-study-card-id');
  await submit(page, 'Red, green and blue.');
  await expect(page.locator('[data-study-card-id]').first()).not.toHaveAttribute(
    'data-study-card-id',
    id!,
  );
  expect(calls).toBe(0);
  await expect(page.getByRole('button', { name: 'Undo last answer' })).toBeEnabled();
});

test('keeps a final Simple answer undoable and restores manual marking', async ({ page }) => {
  await start(page, true, true);
  await submit(page, 'Red, green and blue.');
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
  await submit(page, 'Red, green and blue.');
  const report = page.getByRole('main', { name: 'Session report' });
  await expect(report).toBeVisible();
  await report.getByRole('button', { name: 'Undo last answer' }).click();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await expect(report).toHaveCount(0);
  await page.getByRole('button', { name: 'Yes', exact: true }).click();
  await expect(report).toBeVisible();
  await expect(report.getByRole('button', { name: 'Undo last answer' })).toHaveCount(0);
});

test('holds an automatic answer with Space and resumes as soon as it is released', async ({
  page,
}) => {
  let release!: () => void;
  const response = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/ai/jev', async (route) => {
    await response;
    await route.fulfill({
      json: { value: 0, confidence: 0.98, inputTokens: 600, model: 'jev-1.14.0', feedback },
    });
  });
  await start(page);
  const card = page.locator('[data-study-card-id]').first();
  const id = await card.getAttribute('data-study-card-id');
  await submit(page);
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toBeVisible();
  await page.keyboard.down('Space');
  release();
  await expect(page.locator('[data-study-face="back"] [data-typed-verdict]')).toContainText(
    'Partly right',
  );
  // Exceed the normal 700 ms deadline while physically holding the brake.
  await page.waitForTimeout(1000);
  await expect(card).toHaveAttribute('data-study-card-id', id!);
  await page.evaluate((id) => {
    const card = document.querySelector(`[data-study-card-id="${id}"]`)!;
    const origin = card.getBoundingClientRect().left;
    (window as unknown as { jevReleaseMotion: Promise<number> }).jevReleaseMotion = new Promise(
      (resolve, reject) => {
        window.addEventListener(
          'keyup',
          () => {
            const started = performance.now();
            const sample = () => {
              if (!card.isConnected || Math.abs(card.getBoundingClientRect().left - origin) > 1)
                resolve(performance.now() - started);
              else if (performance.now() - started > 1500)
                reject(new Error('The released answer did not start moving.'));
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          },
          { once: true },
        );
      },
    );
  }, id);
  await page.keyboard.up('Space');
  const elapsed = await page.evaluate(
    () => (window as unknown as { jevReleaseMotion: Promise<number> }).jevReleaseMotion,
  );
  expect(elapsed).toBeLessThan(200);
  await expect(card).not.toHaveAttribute('data-study-card-id', id!);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`shows manual grade labels promptly when they become actionable (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await start(page, false);
    await page.evaluate(() => {
      const grade = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === 'No',
      )!;
      const row = grade.closest('[aria-hidden]')!;
      const labels = [...row.children];
      (window as unknown as { gradeLabelLatency: Promise<number> }).gradeLabelLatency = new Promise(
        (resolve, reject) => {
          const observer = new MutationObserver(() => {
            if (row.getAttribute('aria-hidden') !== 'false') return;
            observer.disconnect();
            const started = performance.now();
            const sample = () => {
              if (labels.every((label) => Number(getComputedStyle(label).opacity) >= 0.5))
                resolve(performance.now() - started);
              else if (performance.now() - started > 1000)
                reject(new Error('Actionable grade labels remained invisible.'));
              else requestAnimationFrame(sample);
            };
            requestAnimationFrame(sample);
          });
          observer.observe(row, { attributes: true, attributeFilter: ['aria-hidden'] });
        },
      );
    });
    await submit(page, 'Yellow');
    const elapsed = await page.evaluate(
      () => (window as unknown as { gradeLabelLatency: Promise<number> }).gradeLabelLatency,
    );
    expect(elapsed).toBeLessThan(150);
    // The primary label must have its own contrast surface while the connecting fill moves.
    await expect(page.getByRole('button', { name: 'Yes', exact: true })).not.toHaveCSS(
      'background-color',
      'rgba(0, 0, 0, 0)',
    );
    await page.getByRole('button', { name: 'No', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`flow-next-${reducedMotion}.png`) });
  });
}

test('types a reveal lesson through the learner preference and applies a Jev mark', async ({ page }) => {
  await page.route('**/api/ai/jev', (route) => route.fulfill({
    json: { value: 1, confidence: 0.98, inputTokens: 600, model: 'jev-1.14.0' },
  }));
  await start(page, true, false, true);
  const first = await page.locator('[data-study-card-id]').first().getAttribute('data-study-card-id');
  await submit(page);
  await expect(page.locator('[data-study-face="back"] [data-typed-checking]')).toBeVisible();
  await expect(page.locator('[data-study-card-id]').first()).not.toHaveAttribute('data-study-card-id', first!);
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible();
});

test('does not mark abandoned typing when another tab changes the answer preference', async ({ page, context }) => {
  await start(page, true, true, true);
  const first = await page.locator('[data-study-card-id]').first().getAttribute('data-study-card-id');
  await page.getByRole('textbox', { name: 'Your answer' }).fill('Red, green and blue.');
  const settings = await context.newPage();
  await settings.goto('/#/settings#settings-study');
  const options = settings.getByRole('radiogroup', { name: 'Answer cards by' });
  await options.getByRole('radio', { name: 'Revealing', exact: true }).click();
  await page.bringToFront();
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toHaveCount(0);
  await page.locator('button').filter({ hasText: /^Show answer$/ }).click();
  await settings.bringToFront();
  await options.getByRole('radio', { name: 'Typing where possible', exact: true }).click();
  await page.bringToFront();
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await expect(page.locator('[data-study-card-id]').first()).toHaveAttribute('data-study-card-id', first!);
  await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeVisible();
  await settings.close();
});
