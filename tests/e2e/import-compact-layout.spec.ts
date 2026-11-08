import { expect, test } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { settle } from './fixtures/flowEvidence';
import { currentSharePayload } from './fixtures/currentSharePayload';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`keeps compact import controls aligned and step motion usable with ${reducedMotion}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion, colorScheme: 'light' });
    await enterFreshLacuna(page);
    await openImport(page);
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    const panel = page.locator('.import-panel');
    const surface = page.locator('.flow-expansion').filter({ has: panel });
    const input = panel.getByRole('textbox', { name: 'Paste your cards' });
    await expect(input).toBeFocused();
    await settle(surface);

    const sources = panel.getByRole('button', { name: 'Back to import sources' });
    const progress = panel.getByLabel('Import progress');
    const sourceBounds = (await sources.boundingBox())!;
    const progressBounds = (await progress.boundingBox())!;
    expect(
      Math.abs(
        sourceBounds.y + sourceBounds.height / 2 - progressBounds.y - progressBounds.height / 2,
      ),
    ).toBeLessThanOrEqual(1);
    await expect(progress).toContainText('Step 1 of 3');
    await expect(panel.getByRole('button', { name: 'Review cards' })).toBeDisabled();

    await input.fill('bonjour\thello\nmerci\tthanks');
    await panel.locator('summary').click();
    await panel.getByRole('combobox', { name: 'Format' }).selectOption('tsv');
    await expect(panel.getByRole('status')).toHaveText('2 cards');
    await panel.locator('summary').click();

    // Sample rendered frames from the action itself, before Playwright waits for stability.
    const frames = await panel.evaluate(
      (element) =>
        new Promise<Array<{ opacity: number; transform: string }>>((resolve) => {
          const frames: Array<{ opacity: number; transform: string }> = [];
          const start = performance.now();
          element.querySelector<HTMLButtonElement>('button[aria-label="Review cards"]')!.click();
          const sample = () => {
            const step = element.querySelector('[data-step="review"]')?.parentElement;
            if (step) {
              const style = getComputedStyle(step);
              frames.push({ opacity: Number(style.opacity), transform: style.transform });
            }
            if (performance.now() - start < 600) requestAnimationFrame(sample);
            else resolve(frames);
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(frames.length).toBeGreaterThan(0);
    if (reducedMotion === 'no-preference') {
      expect(frames.some((frame) => frame.opacity > 0 && frame.opacity < 1)).toBe(true);
      expect(frames.some((frame) => frame.transform !== 'none')).toBe(true);
    } else {
      expect(frames.every((frame) => frame.opacity === 1 && frame.transform === 'none')).toBe(true);
    }
    await expect(panel.locator('[data-step="input"]')).toHaveCount(0);
    await expect(panel.locator('[data-step="review"] h2')).toBeFocused();
    await expect(progress).toContainText('Step 2 of 3');

    await panel.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(input).toHaveValue('bonjour\thello\nmerci\tthanks');
    await expect(panel.locator('[data-step="review"]')).toHaveCount(0);
    await panel.locator('summary').click();
    await expect(panel.getByRole('combobox', { name: 'Format' })).toHaveValue('tsv');
    await panel.locator('summary').click();

    await sources.click();
    await expect(page.getByRole('button', { name: /Text or spreadsheet/ })).toBeFocused();
    await page.getByRole('button', { name: /Text or spreadsheet/ }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('bonjour\thello\nmerci\tthanks');
  });
}

test('keeps shared-course input compact and opens the file preview', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ colorScheme: 'light' });
  await enterFreshLacuna(page);
  await openImport(page);
  await page.getByRole('button', { name: /Lacuna course/ }).click();
  const panel = page.locator('.import-panel');
  const input = panel.getByRole('textbox', { name: 'Share link or code to import' });
  await expect(input).toBeFocused();
  await expect(panel.getByRole('button', { name: 'Read code' })).toBeDisabled();
  await input.fill('not a valid course');
  await panel.getByRole('button', { name: 'Read code' }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(input).toHaveValue('not a valid course');
  await input.fill('');
  await expect(panel.getByRole('alert')).toHaveCount(0);

  await panel.getByLabel('Course file to import').setInputFiles({
    name: 'French.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'lacuna-course',
        version: 1,
        assets: [],
        payload: currentSharePayload({
          at: Date.now(),
          course: { n: 'French', o: 0, c: 0, e: 0, um: 'open' },
          lessons: [{ n: 'Greetings', notes: [], cards: [{ k: 0, f: 'bonjour', b: 'hello' }] }],
        }),
      }),
    ),
  });
  await expect(panel.getByRole('heading', { name: 'Ready to import' })).toBeVisible();
  const steady = panel.getByRole('radio', { name: /Steady retention/ });
  await steady.focus();
  await steady.press('Space');
  await expect(steady).toBeChecked();
  await panel.getByRole('button', { name: 'Add to my courses' }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByRole('heading', { name: 'French', exact: true })).toBeVisible();
});
