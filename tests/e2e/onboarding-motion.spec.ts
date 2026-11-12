import { expect, test, type Locator, type Page } from '@playwright/test';
import { settle } from './fixtures/flowEvidence';

/** Sample presented bounds across an action, rather than accepting a snapped final state. */
async function recordSheet(page: Page, action: () => Promise<void>) {
  const samples = page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const widths: number[] = [];
        const start = performance.now();
        function sample() {
          const sheet = document.querySelector('[role="dialog"]');
          if (sheet) widths.push(sheet.getBoundingClientRect().width);
          if (performance.now() - start > 1400) resolve(widths);
          else requestAnimationFrame(sample);
        }
        requestAnimationFrame(sample);
      }),
  );
  await action();
  return samples;
}

async function openFromKeyboard(trigger: Locator) {
  await trigger.focus();
  await trigger.press('Enter');
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`onboarding choices grow and return with ${reducedMotion} motion`, async ({
    page,
  }, info) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1280, height: 720 });
    // The measured interaction starts at the material choices, after setup has settled.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
    await page.getByRole('button', { name: 'Show answer', exact: true }).last().click();
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Would you like AI marking?' })).toBeFocused();
    await page.getByRole('radio', { name: 'No', exact: true }).check();
    await expect(page.getByRole('checkbox', { name: /read this/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'What do you want to learn?' })).toBeFocused();
    await page.emulateMedia({ reducedMotion });

    for (const label of ['Create my own', 'Import']) {
      const trigger = page.getByRole('button', { name: label, exact: true });
      const origin = (await trigger.boundingBox())!;
      const widths = await recordSheet(page, () => openFromKeyboard(trigger));
      const sheet = page.getByRole('dialog', { name: label, exact: true });
      await expect(sheet).toBeVisible();
      await settle(sheet);
      const expanded = (await sheet.boundingBox())!;
      expect(expanded.width).toBeGreaterThan(origin.width + 100);
      expect(expanded.y).toBeGreaterThanOrEqual(16);
      expect(expanded.y + expanded.height).toBeLessThanOrEqual(704);
      if (reducedMotion === 'no-preference') {
        expect(widths.some((width) => width > origin.width + 5 && width < expanded.width - 5)).toBe(
          true,
        );
      } else {
        expect(widths.every((width) => Math.abs(width - expanded.width) < 1)).toBe(true);
      }
      if (label === 'Create my own') {
        await expect(sheet.getByRole('textbox', { name: 'Course name' })).toBeFocused();
      } else {
        await sheet.getByRole('button', { name: /Text or spreadsheet/ }).click();
        const paste = sheet.getByRole('textbox', { name: 'Paste your cards', exact: true });
        await expect(paste).toBeFocused();
        await paste.fill('Enzyme\tA biological catalyst');
        await page.keyboard.press('Escape');
        await expect(paste).toHaveValue('Enzyme\tA biological catalyst');
        await sheet.getByRole('button', { name: 'Back to import sources', exact: true }).click();
        await expect(sheet.getByRole('button', { name: /Text or spreadsheet/ })).toBeFocused();
      }
      await page.screenshot({ path: info.outputPath(`${label}-expanded.png`) });
      const closing = await recordSheet(page, () => page.keyboard.press('Escape'));
      await expect(sheet).toHaveCount(0);
      await expect(trigger).toBeFocused();
      if (reducedMotion === 'no-preference') {
        expect(
          closing.some((width) => width > origin.width + 5 && width < expanded.width - 5),
        ).toBe(true);
      }
    }

    // The importer remains usable when there is less height than its natural content needs.
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.getByRole('button', { name: 'Import', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Import', exact: true });
    await settle(sheet);
    const chooseFile = sheet.getByRole('button', { name: 'Choose file', exact: true });
    await chooseFile.scrollIntoViewIfNeeded();
    await expect(chooseFile).toBeInViewport();
    await page.screenshot({ path: info.outputPath('import-short-window.png') });
    await sheet.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  });
}
