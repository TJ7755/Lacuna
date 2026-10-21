import { expect, test, type Locator } from '@playwright/test';
import { enterFreshLacuna } from './fixtures/lacunaApp';

async function textWidths(trigger: Locator, opening: boolean) {
  return trigger.evaluate(
    (button, opening) =>
      new Promise<number[]>((resolve) => {
        const widths: number[] = [];
        button.addEventListener(
          'click',
          () => {
            const sample = () => {
              const close = document.querySelector('[aria-label="Close session preview"]');
              if (close) {
                const walker = document.createTreeWalker(close, NodeFilter.SHOW_TEXT);
                while (walker.nextNode()) {
                  if (walker.currentNode.textContent === 'Study') {
                    const range = document.createRange();
                    range.selectNodeContents(walker.currentNode);
                    widths.push(range.getBoundingClientRect().width);
                    break;
                  }
                }
              }
              if (widths.length < 24 && (opening || close)) requestAnimationFrame(sample);
              else resolve(widths);
            };
            requestAnimationFrame(sample);
          },
          { once: true },
        );
      }),
    opening,
  );
}

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`Study scales smoothly and keeps pointer dismissal unhighlighted (${reducedMotion})`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await enterFreshLacuna(page);
    await page
      .getByRole('navigation', { name: 'Courses', exact: true })
      .getByRole('link', { name: 'Welcome to Lacuna', exact: true })
      .click();
    const study = page.getByRole('button', { name: 'Study', exact: true });
    const close = page.getByRole('button', { name: 'Close session preview' });
    const opening = textWidths(study, true);
    await study.click();
    const shrinking = await opening;
    await expect(close).toHaveCSS('user-select', 'none');
    if (reducedMotion === 'no-preference') {
      expect(shrinking[0] - shrinking.at(-1)!).toBeGreaterThan(1);
      expect(new Set(shrinking.map((width) => width.toFixed(2))).size).toBeGreaterThan(3);
    } else {
      expect(Math.max(...shrinking) - Math.min(...shrinking)).toBeLessThan(0.1);
    }
    await page.screenshot({ path: test.info().outputPath('study-open.png') });
    const closing = textWidths(close, false);
    await close.click();
    const growing = await closing;
    if (reducedMotion === 'no-preference') {
      expect(Math.max(...growing) - growing[0]).toBeGreaterThan(1);
    }
    await expect(close).toHaveCount(0);
    await expect(study).not.toBeFocused();
    expect(await study.evaluate((button) => button.matches(':focus-visible'))).toBe(false);
    await page.screenshot({ path: test.info().outputPath('study-closed.png') });
    await study.focus();
    await study.press('Enter');
    await expect(close).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(close).toHaveCount(0);
    await expect(study).toBeFocused();
  });
}
