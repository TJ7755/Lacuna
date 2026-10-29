import { expect, test } from '@playwright/test';
import { skipOnboarding } from './fixtures/lacunaApp';

// Regression for #458: Settings must reflow with its own text-size setting on
// narrow screens instead of pushing choice groups past their cards.
const SCALES = [
  { label: 'Default', value: 1 },
  { label: 'Large', value: 1.15 },
  { label: 'Larger', value: 1.3 },
];

for (const width of [320, 390]) {
  for (const scale of SCALES) {
    test(`Settings choice groups fit their cards at ${width}px with ${scale.label} text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => {
        localStorage.setItem('lacuna-font-scale', String(value));
        localStorage.setItem('lacuna-font-scale-user-set', '1');
      }, scale.value);
      await page.goto('/');
      await page.getByRole('link', { name: 'Start revising', exact: true }).first().click();
      await skipOnboarding(page);
      await page.goto('/#/settings#settings-study');
      await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
      await expect(page.getByRole('radiogroup', { name: 'Audio playback speed' })).toBeVisible();

      const report = await page.evaluate(() => {
        const main = document.querySelector('main')!;
        const problems: string[] = [];
        if (main.scrollWidth > main.clientWidth + 1) {
          problems.push(`main scrolls sideways: ${main.scrollWidth} > ${main.clientWidth}`);
        }
        for (const card of document.querySelectorAll<HTMLElement>(
          'main section[id^="settings-"]',
        )) {
          const box = card.getBoundingClientRect();
          const style = getComputedStyle(card);
          const left = box.left + parseFloat(style.paddingLeft) - 1;
          const right = box.right - parseFloat(style.paddingRight) + 1;
          for (const control of card.querySelectorAll<HTMLElement>('button, [role="radiogroup"]')) {
            const rect = control.getBoundingClientRect();
            if (rect.width === 0 || control.closest('details:not([open]), [inert]')) continue;
            if (rect.left < left || rect.right > right) {
              const name = control.getAttribute('aria-label') ?? control.textContent?.trim();
              problems.push(
                `${card.id}: "${name}" spans ${rect.left}-${rect.right}, card ${left}-${right}`,
              );
            }
          }
        }
        return problems;
      });
      expect(report).toEqual([]);

      // Labels and their controls never overlap, and explanations keep a reading width.
      for (const name of ['Audio playback speed', 'Answer cards by', 'Grading strictness']) {
        const label = page.locator('main').getByText(name, { exact: true });
        const group = page.getByRole('radiogroup', { name });
        const [labelBox, groupBox] = await Promise.all([label.boundingBox(), group.boundingBox()]);
        const overlaps =
          labelBox!.x < groupBox!.x + groupBox!.width &&
          groupBox!.x < labelBox!.x + labelBox!.width &&
          labelBox!.y < groupBox!.y + groupBox!.height &&
          groupBox!.y < labelBox!.y + labelBox!.height;
        expect(overlaps, `${name} label overlaps its choices`).toBe(false);
      }
      const explanation = page.getByText(/^Typed answers ignore case/);
      const card = page.locator('main section#settings-study');
      const [textBox, cardBox] = await Promise.all([explanation.boundingBox(), card.boundingBox()]);
      expect(textBox!.width).toBeGreaterThan(cardBox!.width * 0.6);

      await page.getByRole('radiogroup', { name: 'Answer cards by' }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: test.info().outputPath(`settings-${width}-${scale.label}.png`),
        fullPage: true,
        animations: 'disabled',
      });
    });
  }
}
