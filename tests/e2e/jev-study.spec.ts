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

async function start(page: Page, enabled = true, simple = false) {
  await page.route('**/api/ai/session', (route) =>
    route.fulfill({
      json: { token: 'browser-test-session', expiresAt: Date.now() + 600_000 },
    }),
  );
  await enterFreshLacuna(page);
  await page.addScriptTag({ content: fixture });
  const seeded = await page.evaluate(async (enabled) => {
    const fixture = (
      window as unknown as {
        JevStudyFixture: {
          seed(enabled: boolean): Promise<{ lessonId: string; cardIds: string[] }>;
        };
      }
    ).JevStudyFixture;
    return fixture.seed(enabled);
  }, enabled);
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
