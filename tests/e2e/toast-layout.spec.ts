import { expect, test, type Page } from '@playwright/test';
import { enterFreshLacuna, openImport } from './fixtures/lacunaApp';
import { currentSharePayload } from './fixtures/currentSharePayload';

const updateMessage = 'Updated the course — applied 5 updates and 58 removals.';

async function importRevision(page: Page, revision: number) {
  if (revision > 1) {
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  }
  await openImport(page);
  await page.getByLabel('Import file', { exact: true }).setInputFiles({
    name: 'Biology.lacuna',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'lacuna-course',
        version: 1,
        assets: [],
        payload: currentSharePayload({
          v: 6,
          li: 'toast-layout-biology',
          rv: revision,
          at: revision * 1000,
          course: { n: 'Biology', o: 0, c: 0, e: 2_000_000_000_000, um: 'open' },
          lessons: [
            {
              i: 'toast-layout-cells',
              n: 'Cells',
              notes: [],
              cards: Array.from({ length: revision === 1 ? 63 : 5 }, (_, index) => ({
                id: `toast-layout-card-${index}`,
                k: 0,
                f: `Cell question ${index + 1}`,
                b: revision === 1 ? 'Original answer' : 'Updated answer',
              })),
            },
          ],
        }),
      }),
    ),
  });
  if (revision === 1) {
    await page.getByRole('radio', { name: /Exam date/ }).press('Space');
  }
  await page
    .getByRole('button', {
      name: revision === 1 ? 'Add to my courses' : 'Update course',
      exact: true,
    })
    .click();
  await page
    .getByRole('list', { name: 'Course path' })
    .getByRole('button', { name: 'Cells', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Cells', exact: true })).toBeVisible();
}

for (const width of [1440, 390, 320]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`toast layout at ${width}px in ${theme}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem('lacuna-theme', value), theme);
      await enterFreshLacuna(page);
      await importRevision(page, 1);
      const stack = page.getByLabel('Notifications', { exact: true });
      const short = stack.getByText('Added 1 course and 63 cards.', { exact: true });
      await expect(short).toBeVisible();
      await short.hover();
      expect(await stack.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath('short-toast.png') });
      const shortToast = stack
        .locator(':scope > div')
        .filter({ hasText: 'Added 1 course and 63 cards.' });
      expect((await shortToast.boundingBox())!.height).toBeLessThanOrEqual(56);
      await page.mouse.move(0, 0);
      await expect(short).toBeHidden();

      await importRevision(page, 2);
      const message = stack.getByText(updateMessage, { exact: true });
      await expect(message).toBeVisible();
      await page.mouse.move(0, 0);
      await expect
        .poll(() =>
          stack
            .locator('.origin-left')
            .evaluate((element) =>
              Number((element as HTMLElement).style.transform.match(/scaleX\(([^)]+)\)/)?.[1]),
            ),
        )
        .toBeLessThan(0.65);
      await message.hover();
      const toast = stack.locator(':scope > div').filter({ hasText: updateMessage });
      await page.screenshot({ path: testInfo.outputPath('update-toast.png') });
      await toast.screenshot({ path: testInfo.outputPath('update-toast-detail.png') });

      const layout = await toast.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const text = Array.from(element.querySelectorAll('span')).find(
          (span) => span.textContent === 'Updated the course — applied 5 updates and 58 removals.',
        )!;
        const textBounds = text.getBoundingClientRect();
        const icon = element.querySelector('svg')!.getBoundingClientRect();
        const bar = element.querySelector<HTMLElement>('.origin-left')!;
        const track = bar.parentElement!.getBoundingClientRect();
        const lines = new Map<number, number>();
        const node = text.firstChild!;
        for (let index = 0; index < node.textContent!.length; index++) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const rect = range.getBoundingClientRect();
          lines.set(rect.y, (lines.get(rect.y) ?? 0) + 1);
        }
        return {
          topSpace: textBounds.top - bounds.top,
          bottomSpace: bounds.bottom - textBounds.bottom,
          iconOffset: icon.top - textBounds.top,
          lineHeight: parseFloat(getComputedStyle(text).lineHeight),
          lineLengths: Array.from(lines.values()),
          trackLeft: track.left - bounds.left,
          trackRight: bounds.right - track.right,
          trackBottom: bounds.bottom - track.bottom,
          insideViewport: bounds.left >= 16 && bounds.right <= innerWidth - 16,
          noOverflow: element.scrollWidth <= element.clientWidth,
        };
      });
      expect(layout.lineLengths).toHaveLength(2);
      expect(Math.min(...layout.lineLengths)).toBeGreaterThanOrEqual(18);
      expect(layout.topSpace).toBeGreaterThanOrEqual(12);
      expect(layout.bottomSpace).toBeGreaterThanOrEqual(12);
      expect(Math.abs(layout.iconOffset - (layout.lineHeight - 16) / 2)).toBeLessThan(1);
      expect(layout.trackLeft).toBeGreaterThanOrEqual(12);
      expect(layout.trackRight).toBeGreaterThanOrEqual(12);
      expect(layout.trackBottom).toBeGreaterThanOrEqual(6);
      expect(layout.insideViewport).toBe(true);
      expect(layout.noOverflow).toBe(true);
      await expect(stack).toHaveAttribute('aria-live', 'polite');
      await expect(message).toHaveCount(1);
    });
  }
}
